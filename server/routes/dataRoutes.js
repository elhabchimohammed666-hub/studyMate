const express = require('express');
const mongoose = require('mongoose');
const authMiddleware = require('../middleware/auth');
const Subject = require('../models/Subject');
const Task = require('../models/Task');
const StudyPlan = require('../models/StudyPlan');

const router = express.Router();
router.use(authMiddleware);

const isValidId = (id) => mongoose.isValidObjectId(id);
const isValidDate = (date) => date == null || date === '' ||
  (typeof date === 'string' && !Number.isNaN(Date.parse(date)));
const ownedSubject = (subjectId, userId) => Subject.exists({ _id: subjectId, userId });
const taskFields = ['title', 'description', 'subjectId', 'priority', 'deadline', 'estimateMinutes', 'completed'];
const cleanTaskUpdates = (body) => Object.fromEntries(
  taskFields.filter((field) => Object.hasOwn(body, field)).map((field) => [field, body[field]])
);

router.get('/dashboard', async (req, res) => {
  try {
    const userId = req.user.id;
    const [subjects, tasks, studyPlans] = await Promise.all([
      Subject.find({ userId }).sort({ createdAt: -1 }).lean(),
      Task.find({ userId }).populate('subjectId', 'name').sort({ createdAt: -1 }).lean(),
      StudyPlan.find({ userId }).sort({ createdAt: -1 }).lean()
    ]);
    const completed = tasks.filter((task) => task.completed).length;
    const pendingTasks = tasks.filter((task) => !task.completed);
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const nextWeek = new Date(startOfToday);
    nextWeek.setDate(nextWeek.getDate() + 7);
    const overdueTasks = pendingTasks.filter((task) => task.deadline && new Date(task.deadline) < startOfToday);
    const upcomingTasks = pendingTasks
      .filter((task) => task.deadline && new Date(task.deadline) >= startOfToday && new Date(task.deadline) <= nextWeek)
      .sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
    const subjectProgress = subjects.map((subject) => {
      const subjectTasks = tasks.filter((task) => String(task.subjectId?._id || task.subjectId) === String(subject._id));
      const subjectCompleted = subjectTasks.filter((task) => task.completed).length;
      return {
        subject,
        totalTasks: subjectTasks.length,
        completedTasks: subjectCompleted,
        pendingTasks: subjectTasks.length - subjectCompleted,
        progress: subjectTasks.length ? Math.round((subjectCompleted / subjectTasks.length) * 100) : 0
      };
    });
    res.json({
      subjects,
      tasks,
      studyPlans,
      stats: {
        totalSubjects: subjects.length,
        totalTasks: tasks.length,
        pendingTasks: pendingTasks.length,
        completedTasks: completed,
        overdueTasks: overdueTasks.length,
        completionRate: tasks.length ? Math.round((completed / tasks.length) * 100) : 0
      },
      upcomingTasks,
      overdueTasks,
      recentTasks: tasks.slice(0, 5),
      subjectProgress
    });
  } catch (error) {
    console.error('Dashboard request failed:', error);
    res.status(500).json({ message: 'Unable to load the dashboard.' });
  }
});

router.get('/subjects', async (req, res) => {
  try {
    res.json(await Subject.find({ userId: req.user.id }).sort({ createdAt: -1 }));
  } catch (error) {
    console.error('Subject list failed:', error);
    res.status(500).json({ message: 'Unable to load subjects.' });
  }
});

router.post('/subjects', async (req, res) => {
  try {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const description = typeof req.body.description === 'string' ? req.body.description.trim() : '';
    if (!name || name.length > 100 || description.length > 500) {
      return res.status(400).json({ message: 'Subject names must be 1–100 characters and descriptions no more than 500 characters.' });
    }
    res.status(201).json(await Subject.create({ userId: req.user.id, name, description }));
  } catch (error) {
    console.error('Subject creation failed:', error);
    res.status(500).json({ message: 'Unable to create the subject.' });
  }
});

router.patch('/subjects/:id', async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ message: 'Invalid subject ID.' });
    const updates = {};
    if (typeof req.body.name === 'string') updates.name = req.body.name.trim();
    if (typeof req.body.description === 'string') updates.description = req.body.description.trim();
    if (updates.name !== undefined && (!updates.name || updates.name.length > 100)) {
      return res.status(400).json({ message: 'Subject name must be between 1 and 100 characters.' });
    }
    if (updates.description?.length > 500) {
      return res.status(400).json({ message: 'Subject descriptions cannot exceed 500 characters.' });
    }
    const subject = await Subject.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      { $set: updates },
      { new: true, runValidators: true }
    );
    if (!subject) return res.status(404).json({ message: 'Subject not found.' });
    res.json(subject);
  } catch (error) {
    console.error('Subject update failed:', error);
    res.status(500).json({ message: 'Unable to update the subject.' });
  }
});

router.delete('/subjects/:id', async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ message: 'Invalid subject ID.' });
    const subject = await Subject.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    if (!subject) return res.status(404).json({ message: 'Subject not found.' });
    await Task.deleteMany({ userId: req.user.id, subjectId: subject._id });
    res.json({ message: 'Subject and its tasks deleted.' });
  } catch (error) {
    console.error('Subject deletion failed:', error);
    res.status(500).json({ message: 'Unable to delete the subject.' });
  }
});

router.get('/tasks', async (req, res) => {
  try {
    const query = { userId: req.user.id };
    if (req.query.subjectId) {
      if (!isValidId(req.query.subjectId)) return res.status(400).json({ message: 'Invalid subject ID.' });
      query.subjectId = req.query.subjectId;
    }
    if (req.query.status === 'pending') query.completed = false;
    if (req.query.status === 'completed') query.completed = true;
    if (['Low', 'Medium', 'High'].includes(req.query.priority)) query.priority = req.query.priority;
    if (typeof req.query.search === 'string' && req.query.search.trim()) {
      query.title = { $regex: req.query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
    }
    const sort = req.query.sort === 'deadline'
      ? { deadline: 1, createdAt: -1 }
      : req.query.sort === 'priority'
        ? { priority: -1, createdAt: -1 }
        : { createdAt: -1 };
    res.json(await Task.find(query).populate('subjectId', 'name').sort(sort));
  } catch (error) {
    console.error('Task list failed:', error);
    res.status(500).json({ message: 'Unable to load tasks.' });
  }
});

router.post('/tasks', async (req, res) => {
  try {
    const title = typeof req.body.title === 'string' ? req.body.title.trim() : '';
    if (!title || title.length > 160) {
      return res.status(400).json({ message: 'Task title must be between 1 and 160 characters.' });
    }
    if (typeof req.body.description === 'string' && req.body.description.length > 1000) {
      return res.status(400).json({ message: 'Task descriptions cannot exceed 1,000 characters.' });
    }
    if (req.body.subjectId && (!isValidId(req.body.subjectId) || !(await ownedSubject(req.body.subjectId, req.user.id)))) {
      return res.status(400).json({ message: 'Choose one of your own subjects.' });
    }
    if (!isValidDate(req.body.deadline)) return res.status(400).json({ message: 'Enter a valid due date.' });
    const priority = req.body.priority || 'Medium';
    if (!['Low', 'Medium', 'High'].includes(priority)) return res.status(400).json({ message: 'Invalid priority.' });
    const estimateMinutes = req.body.estimateMinutes === '' || req.body.estimateMinutes == null
      ? null
      : Number(req.body.estimateMinutes);
    if (estimateMinutes !== null && (!Number.isInteger(estimateMinutes) || estimateMinutes < 1)) {
      return res.status(400).json({ message: 'Estimated duration must be a positive number of minutes.' });
    }
    const task = await Task.create({
      userId: req.user.id,
      title,
      description: typeof req.body.description === 'string' ? req.body.description.trim() : '',
      subjectId: req.body.subjectId || null,
      priority,
      deadline: req.body.deadline || null,
      estimateMinutes
    });
    res.status(201).json(task);
  } catch (error) {
    console.error('Task creation failed:', error);
    res.status(500).json({ message: 'Unable to create the task.' });
  }
});

router.patch('/tasks/:id', async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ message: 'Invalid task ID.' });
    const updates = cleanTaskUpdates(req.body);
    if (!Object.keys(updates).length) return res.status(400).json({ message: 'No task changes were provided.' });
    if (Object.hasOwn(updates, 'title')) {
      if (typeof updates.title !== 'string' || !updates.title.trim() || updates.title.trim().length > 160) {
        return res.status(400).json({ message: 'Task title must be between 1 and 160 characters.' });
      }
      updates.title = updates.title.trim();
    }
    if (Object.hasOwn(updates, 'description')) updates.description = String(updates.description || '').trim();
    if (updates.description?.length > 1000) {
      return res.status(400).json({ message: 'Task descriptions cannot exceed 1,000 characters.' });
    }
    if (Object.hasOwn(updates, 'subjectId') && updates.subjectId &&
        (!isValidId(updates.subjectId) || !(await ownedSubject(updates.subjectId, req.user.id)))) {
      return res.status(400).json({ message: 'Choose one of your own subjects.' });
    }
    if (Object.hasOwn(updates, 'deadline')) {
      if (!isValidDate(updates.deadline)) return res.status(400).json({ message: 'Enter a valid due date.' });
      if (updates.deadline === '') updates.deadline = null;
    }
    if (Object.hasOwn(updates, 'priority') && !['Low', 'Medium', 'High'].includes(updates.priority)) {
      return res.status(400).json({ message: 'Invalid priority.' });
    }
    if (Object.hasOwn(updates, 'estimateMinutes')) {
      updates.estimateMinutes = updates.estimateMinutes === '' || updates.estimateMinutes == null ? null : Number(updates.estimateMinutes);
      if (updates.estimateMinutes !== null && (!Number.isInteger(updates.estimateMinutes) || updates.estimateMinutes < 1)) {
        return res.status(400).json({ message: 'Estimated duration must be a positive number of minutes.' });
      }
    }
    if (Object.hasOwn(updates, 'completed') && typeof updates.completed !== 'boolean') {
      return res.status(400).json({ message: 'Task status must be completed or pending.' });
    }
    const task = await Task.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      { $set: updates },
      { new: true, runValidators: true }
    ).populate('subjectId', 'name');
    if (!task) return res.status(404).json({ message: 'Task not found.' });
    res.json(task);
  } catch (error) {
    console.error('Task update failed:', error);
    res.status(500).json({ message: 'Unable to update the task.' });
  }
});

router.delete('/tasks/:id', async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ message: 'Invalid task ID.' });
    const task = await Task.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    if (!task) return res.status(404).json({ message: 'Task not found.' });
    res.json({ message: 'Task deleted.' });
  } catch (error) {
    console.error('Task deletion failed:', error);
    res.status(500).json({ message: 'Unable to delete the task.' });
  }
});

router.get('/study-plans', async (req, res) => {
  try {
    res.json(await StudyPlan.find({ userId: req.user.id }).sort({ createdAt: -1 }));
  } catch (error) {
    console.error('Study plan list failed:', error);
    res.status(500).json({ message: 'Unable to load saved study plans.' });
  }
});

router.post('/study-plans', async (req, res) => {
  try {
    const { topic, goal, currentLevel, availableTime, deadline, learningObjective, expectedOutcome, feasibilityNote, activities } = req.body;
    if (typeof topic !== 'string' || !topic.trim() || topic.length > 120 ||
        typeof goal !== 'string' || !goal.trim() || goal.length > 500 ||
        !['Beginner', 'Intermediate', 'Advanced'].includes(currentLevel) ||
        typeof availableTime !== 'string' || !availableTime.trim() || availableTime.length > 100 ||
        typeof learningObjective !== 'string' || !learningObjective.trim() ||
        typeof expectedOutcome !== 'string' || !expectedOutcome.trim() ||
        (feasibilityNote != null && typeof feasibilityNote !== 'string') ||
        !Array.isArray(activities) || activities.length < 1 || activities.length > 20) {
      return res.status(400).json({ message: 'A complete generated study plan is required.' });
    }
    if (!isValidDate(deadline)) return res.status(400).json({ message: 'Enter a valid target date.' });
    const validActivities = activities.every((activity) =>
      activity && typeof activity === 'object' &&
      typeof activity.title === 'string' && activity.title.trim() &&
      typeof activity.description === 'string' && activity.description.trim() &&
      Number.isInteger(Number(activity.durationMinutes)) && Number(activity.durationMinutes) > 0 &&
      Array.isArray(activity.exercises) && activity.exercises.every((exercise) => typeof exercise === 'string')
    );
    if (!validActivities) return res.status(400).json({ message: 'One or more study activities are invalid.' });
    const plan = await StudyPlan.create({
      userId: req.user.id,
      topic, goal, currentLevel, availableTime,
      deadline: deadline || null,
      learningObjective,
      expectedOutcome,
      feasibilityNote: feasibilityNote || '',
      activities: activities.map(({ title, description, durationMinutes, exercises }) => ({
        title: title.trim(),
        description: description.trim(),
        durationMinutes: Number(durationMinutes),
        exercises: exercises.map((exercise) => String(exercise).trim()).filter(Boolean).slice(0, 5)
      }))
    });
    res.status(201).json(plan);
  } catch (error) {
    console.error('Study plan save failed:', error);
    res.status(500).json({ message: 'Unable to save the study plan.' });
  }
});

router.delete('/study-plans/:id', async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ message: 'Invalid study plan ID.' });
    const plan = await StudyPlan.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    if (!plan) return res.status(404).json({ message: 'Study plan not found.' });
    res.json({ message: 'Study plan deleted.' });
  } catch (error) {
    console.error('Study plan deletion failed:', error);
    res.status(500).json({ message: 'Unable to delete the study plan.' });
  }
});

router.post('/study-plans/:id/tasks', async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ message: 'Invalid study plan ID.' });
    const plan = await StudyPlan.findOne({ _id: req.params.id, userId: req.user.id });
    if (!plan) return res.status(404).json({ message: 'Study plan not found.' });
    const index = Number(req.body.activityIndex);
    if (!Number.isInteger(index) || index < 0 || index >= plan.activities.length) {
      return res.status(400).json({ message: 'Choose a valid activity from the plan.' });
    }
    if (req.body.subjectId && !(await ownedSubject(req.body.subjectId, req.user.id))) {
      return res.status(400).json({ message: 'Choose one of your own subjects.' });
    }
    const activity = plan.activities[index];
    const task = await Task.create({
      userId: req.user.id,
      subjectId: req.body.subjectId || null,
      title: activity.title,
      description: activity.description,
      priority: 'Medium',
      deadline: req.body.deadline || null,
      estimateMinutes: activity.durationMinutes,
      completed: false
    });
    res.status(201).json(task);
  } catch (error) {
    console.error('Study plan activity import failed:', error);
    res.status(500).json({ message: 'Unable to add this activity to your tasks.' });
  }
});

module.exports = router;
