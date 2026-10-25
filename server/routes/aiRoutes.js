const express = require('express');
const authMiddleware = require('../middleware/auth');
const { generateStudyPlan } = require('../services/studyPlanService');

const router = express.Router();
router.use(authMiddleware);

router.post('/generate', async (req, res) => {
  const { topic, goal, currentLevel, availableTime, deadline } = req.body;
  if (typeof topic !== 'string' || !topic.trim() ||
      typeof goal !== 'string' || !goal.trim() ||
      !['Beginner', 'Intermediate', 'Advanced'].includes(currentLevel) ||
      typeof availableTime !== 'string' || !availableTime.trim() ||
      topic.length > 120 || goal.length > 500 || availableTime.length > 100) {
    return res.status(400).json({ message: 'Provide a topic, learning goal, current level, and available study time.' });
  }
  if (deadline && (typeof deadline !== 'string' || Number.isNaN(Date.parse(deadline)))) {
    return res.status(400).json({ message: 'Enter a valid target date.' });
  }
  try {
    const generated = await generateStudyPlan({
      topic: topic.trim().slice(0, 120),
      goal: goal.trim().slice(0, 500),
      currentLevel,
      availableTime: availableTime.trim(),
      deadline: deadline || null
    });
    res.json({
      topic: topic.trim(),
      goal: goal.trim(),
      currentLevel,
      availableTime: availableTime.trim(),
      deadline: deadline || null,
      ...generated
    });
  } catch (error) {
    console.error('Study plan generation failed:', error.message);
    res.status(error.status || 502).json({ message: error.message || 'Unable to generate a study plan.' });
  }
});

module.exports = router;
