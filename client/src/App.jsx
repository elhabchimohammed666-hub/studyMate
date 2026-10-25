import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

const API_URL = import.meta.env.VITE_API_URL || '/api';
const emptyDashboard = {
  subjects: [],
  tasks: [],
  studyPlans: [],
  stats: { totalSubjects: 0, totalTasks: 0, pendingTasks: 0, completedTasks: 0, overdueTasks: 0, completionRate: 0 },
  upcomingTasks: [],
  overdueTasks: [],
  recentTasks: [],
  subjectProgress: []
};
const initialTask = { title: '', description: '', priority: 'Medium', deadline: '', subjectId: '', estimateMinutes: '' };
const initialPlanner = { topic: '', goal: '', currentLevel: 'Beginner', availableTime: '1 hour/day', deadline: '' };
const views = [
  { id: 'dashboard', label: 'Overview', icon: '⌂' },
  { id: 'subjects', label: 'My subjects', icon: '▤' },
  { id: 'tasks', label: 'Study tasks', icon: '✓' },
  { id: 'planner', label: 'AI study planner', icon: '✳' },
  { id: 'plans', label: 'Saved plans', icon: '▧' }
];
const routeViews = [...views, { id: 'profile', label: 'Profile', icon: '◉' }];

function formatDate(date) {
  if (!date) return 'No deadline';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(date));
}

function getDeadlineState(task) {
  if (!task.deadline || task.completed) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const deadline = new Date(task.deadline);
  deadline.setHours(0, 0, 0, 0);
  if (deadline < today) return 'Overdue';
  const week = new Date(today);
  week.setDate(week.getDate() + 7);
  return deadline <= week ? 'Due soon' : null;
}

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [token, setToken] = useState(() => localStorage.getItem('studymate-token') || '');
  const [user, setUser] = useState(null);
  const view = routeViews.some((item) => item.id === location.pathname.slice(1)) ? location.pathname.slice(1) : 'dashboard';
  const setView = (nextView) => navigate(nextView === 'dashboard' ? '/' : `/${nextView}`);
  const [dashboard, setDashboard] = useState(emptyDashboard);
  const [authMode, setAuthMode] = useState('login');
  const [authForm, setAuthForm] = useState({ name: '', email: '', password: '' });
  const [taskForm, setTaskForm] = useState(initialTask);
  const [subjectForm, setSubjectForm] = useState({ name: '', description: '' });
  const [editingTask, setEditingTask] = useState(null);
  const [editingSubject, setEditingSubject] = useState(null);
  const [plannerForm, setPlannerForm] = useState(initialPlanner);
  const [generatedPlan, setGeneratedPlan] = useState(null);
  const [selectedActivities, setSelectedActivities] = useState([]);
  const [importSubject, setImportSubject] = useState('');
  const [filters, setFilters] = useState({ search: '', status: 'all', priority: 'all', subjectId: 'all', sort: 'recent' });
  const [profileForm, setProfileForm] = useState({ name: '', email: '' });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);

  const notify = (message, type = 'success') => {
    setNotice({ message, type });
    window.clearTimeout(notify.timeout);
    notify.timeout = window.setTimeout(() => setNotice(null), 3600);
  };

  const apiFetch = async (endpoint, options = {}) => {
    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers
      }
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
      setToken('');
      throw new Error('Your session expired. Please sign in again.');
    }
    if (!response.ok) throw new Error(data.message || 'The request could not be completed.');
    return data;
  };

  const refreshDashboard = async () => {
    const data = await apiFetch('/dashboard');
    setDashboard({ ...emptyDashboard, ...data });
  };

  useEffect(() => {
    if (!token) {
      localStorage.removeItem('studymate-token');
      setUser(null);
      return;
    }
    localStorage.setItem('studymate-token', token);
    Promise.all([apiFetch('/auth/me'), apiFetch('/dashboard')])
      .then(([profile, data]) => {
        setUser(profile.user);
        setProfileForm({ name: profile.user.name, email: profile.user.email });
        setDashboard({ ...emptyDashboard, ...data });
      })
      .catch((error) => notify(error.message, 'error'));
  }, [token]);

  const visibleTasks = useMemo(() => {
    const query = filters.search.trim().toLowerCase();
    return dashboard.tasks
      .filter((task) => !query || `${task.title} ${task.description}`.toLowerCase().includes(query))
      .filter((task) => filters.status === 'all' || (filters.status === 'completed' ? task.completed : !task.completed))
      .filter((task) => filters.priority === 'all' || task.priority === filters.priority)
      .filter((task) => filters.subjectId === 'all' || String(task.subjectId?._id || task.subjectId || '') === filters.subjectId)
      .sort((a, b) => {
        if (filters.sort === 'deadline') return (a.deadline ? new Date(a.deadline).getTime() : Infinity) - (b.deadline ? new Date(b.deadline).getTime() : Infinity);
        if (filters.sort === 'priority') return ({ High: 0, Medium: 1, Low: 2 }[a.priority] - { High: 0, Medium: 1, Low: 2 }[b.priority]);
        return new Date(b.createdAt) - new Date(a.createdAt);
      });
  }, [dashboard.tasks, filters]);

  const submitAuth = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await fetch(`${API_URL}/auth/${authMode === 'login' ? 'login' : 'register'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(authForm)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Unable to sign in.');
      setUser(data.user);
      setToken(data.token);
      setProfileForm({ name: data.user.name, email: data.user.email });
      setAuthForm({ name: '', email: '', password: '' });
      notify(authMode === 'login' ? 'Welcome back.' : 'Your account is ready.');
    } catch (error) {
      notify(error.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const saveSubject = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      const url = editingSubject ? `/subjects/${editingSubject._id}` : '/subjects';
      await apiFetch(url, { method: editingSubject ? 'PATCH' : 'POST', body: JSON.stringify(subjectForm) });
      setSubjectForm({ name: '', description: '' });
      setEditingSubject(null);
      await refreshDashboard();
      notify(editingSubject ? 'Subject updated.' : 'Subject added.');
    } catch (error) {
      notify(error.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const saveTask = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      const url = editingTask ? `/tasks/${editingTask._id}` : '/tasks';
      await apiFetch(url, { method: editingTask ? 'PATCH' : 'POST', body: JSON.stringify(taskForm) });
      setTaskForm(initialTask);
      setEditingTask(null);
      await refreshDashboard();
      notify(editingTask ? 'Task updated.' : 'Task added to your study list.');
    } catch (error) {
      notify(error.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const toggleTask = async (task) => {
    try {
      await apiFetch(`/tasks/${task._id}`, { method: 'PATCH', body: JSON.stringify({ completed: !task.completed }) });
      await refreshDashboard();
      notify(task.completed ? 'Task reopened.' : 'Nice work — task completed.');
    } catch (error) {
      notify(error.message, 'error');
    }
  };

  const deleteTask = async (task) => {
    if (!window.confirm(`Delete “${task.title}”?`)) return;
    try {
      await apiFetch(`/tasks/${task._id}`, { method: 'DELETE' });
      await refreshDashboard();
      notify('Task deleted.');
    } catch (error) {
      notify(error.message, 'error');
    }
  };

  const editTask = (task) => {
    setEditingTask(task);
    setTaskForm({
      title: task.title,
      description: task.description || '',
      priority: task.priority,
      deadline: task.deadline ? new Date(task.deadline).toISOString().slice(0, 10) : '',
      subjectId: task.subjectId?._id || task.subjectId || '',
      estimateMinutes: task.estimateMinutes || ''
    });
    setView('tasks');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const deleteSubject = async (subject) => {
    const count = dashboard.tasks.filter((task) => String(task.subjectId?._id || task.subjectId || '') === String(subject._id)).length;
    if (!window.confirm(`Delete “${subject.name}” and its ${count} associated task${count === 1 ? '' : 's'}? This cannot be undone.`)) return;
    try {
      await apiFetch(`/subjects/${subject._id}`, { method: 'DELETE' });
      await refreshDashboard();
      notify('Subject and associated tasks deleted.');
    } catch (error) {
      notify(error.message, 'error');
    }
  };

  const generatePlan = async (event) => {
    event.preventDefault();
    setBusy(true);
    setGeneratedPlan(null);
    try {
      const plan = await apiFetch('/ai/generate', {
        method: 'POST',
        body: JSON.stringify(plannerForm)
      });
      setGeneratedPlan(plan);
      setSelectedActivities([]);
      notify('Your study plan is ready to review.');
    } catch (error) {
      notify(error.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const savePlan = async () => {
    if (!generatedPlan) return;
    setBusy(true);
    try {
      const saved = await apiFetch('/study-plans', { method: 'POST', body: JSON.stringify(generatedPlan) });
      setDashboard((current) => ({ ...current, studyPlans: [saved, ...current.studyPlans] }));
      setView('plans');
      notify('Plan saved to your library.');
    } catch (error) {
      notify(error.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const importActivity = async (plan, activityIndex) => {
    try {
      await apiFetch(`/study-plans/${plan._id}/tasks`, {
        method: 'POST',
        body: JSON.stringify({ activityIndex, subjectId: importSubject || null })
      });
      await refreshDashboard();
      notify('Activity added to your tasks.');
    } catch (error) {
      notify(error.message, 'error');
    }
  };

  const importSelected = async (plan) => {
    if (!selectedActivities.length) return notify('Select at least one activity first.', 'error');
    setBusy(true);
    try {
      await Promise.all(selectedActivities.map((activityIndex) =>
        apiFetch(`/study-plans/${plan._id}/tasks`, {
          method: 'POST',
          body: JSON.stringify({ activityIndex, subjectId: importSubject || null })
        })
      ));
      await refreshDashboard();
      notify(`${selectedActivities.length} activities added to your tasks.`);
      setSelectedActivities([]);
    } catch (error) {
      notify(error.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const deletePlan = async (plan) => {
    if (!window.confirm(`Delete the “${plan.topic}” study plan?`)) return;
    try {
      await apiFetch(`/study-plans/${plan._id}`, { method: 'DELETE' });
      setDashboard((current) => ({ ...current, studyPlans: current.studyPlans.filter((item) => item._id !== plan._id) }));
      notify('Study plan deleted.');
    } catch (error) {
      notify(error.message, 'error');
    }
  };

  const saveProfile = async (event) => {
    event.preventDefault();
    try {
      const data = await apiFetch('/auth/me', { method: 'PATCH', body: JSON.stringify(profileForm) });
      setUser(data.user);
      notify('Profile updated.');
    } catch (error) {
      notify(error.message, 'error');
    }
  };

  const logout = () => {
    setToken('');
    setDashboard(emptyDashboard);
    setView('dashboard');
    setAuthMode('login');
    setAuthForm({ name: '', email: '', password: '' });
    notify('You have been signed out.');
  };

  if (!token) {
    return (
      <div className="auth-screen">
        <div className="auth-intro">
          <div className="brand-mark">S<span>+</span></div>
          <p className="eyebrow">YOUR PERSONAL LEARNING SPACE</p>
          <h1>Make room for<br /><em>what’s next.</em></h1>
          <p className="auth-description">A calmer way to plan your learning, stay on top of deadlines, and turn big goals into steady progress.</p>
          <div className="auth-proof"><span>✳</span> A little progress, every day.</div>
        </div>
        <div className="auth-card">
          <p className="eyebrow">{authMode === 'login' ? 'WELCOME BACK' : 'GET STARTED'}</p>
          <h2>{authMode === 'login' ? 'Sign in to StudyMate' : 'Create your account'}</h2>
          <p className="muted">{authMode === 'login' ? 'Pick up right where you left off.' : 'Your own space to learn at your pace.'}</p>
          <div className="auth-tabs">
            <button className={authMode === 'login' ? 'selected' : ''} onClick={() => setAuthMode('login')}>Sign in</button>
            <button className={authMode === 'register' ? 'selected' : ''} onClick={() => setAuthMode('register')}>Create account</button>
          </div>
          <form onSubmit={submitAuth} className="form-stack">
            {authMode === 'register' && <Field label="Your name"><input autoComplete="name" required value={authForm.name} onChange={(event) => setAuthForm({ ...authForm, name: event.target.value })} placeholder="Alex Morgan" /></Field>}
            <Field label="Email address"><input type="email" autoComplete="email" required value={authForm.email} onChange={(event) => setAuthForm({ ...authForm, email: event.target.value })} placeholder="you@example.com" /></Field>
            <Field label="Password"><input type="password" autoComplete={authMode === 'login' ? 'current-password' : 'new-password'} minLength={authMode === 'register' ? 8 : 1} required value={authForm.password} onChange={(event) => setAuthForm({ ...authForm, password: event.target.value })} placeholder={authMode === 'register' ? 'At least 8 characters' : 'Enter your password'} /></Field>
            <button className="button button-primary button-wide" disabled={busy}>{busy ? 'Please wait…' : authMode === 'login' ? 'Sign in' : 'Create account'} <span>→</span></button>
          </form>
          <p className="auth-footnote">Your study workspace is private to your account.</p>
        </div>
        {notice && <Notice notice={notice} />}
      </div>
    );
  }

  const pageTitle = routeViews.find((item) => item.id === view)?.label || 'Overview';
  const stat = dashboard.stats;

  return (
    <div className="workspace">
      <aside className="sidebar">
        <button className="wordmark" onClick={() => setView('dashboard')}><span className="brand-mark small">S<span>+</span></span><span>studymate<small>LEARNING, IN FLOW</small></span></button>
        <div className="nav-caption">WORKSPACE</div>
        <nav className="side-nav">
          {views.map((item) => <button key={item.id} className={view === item.id ? 'active' : ''} onClick={() => setView(item.id)}><span className="nav-icon">{item.icon}</span>{item.label}{item.id === 'tasks' && stat.pendingTasks > 0 && <span className="nav-count">{stat.pendingTasks}</span>}</button>)}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-tip"><span>✦</span><strong>Keep your rhythm</strong><p>Small, focused sessions add up to something big.</p></div>
          <button className="account-button" onClick={() => setView('profile')}><span className="avatar">{(user?.name || 'S').slice(0, 1).toUpperCase()}</span><span className="account-name">{user?.name}<small>Student account</small></span><span className="more">···</span></button>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div><p className="breadcrumb">MY WORKSPACE <span>/</span> {pageTitle.toUpperCase()}</p><h1>{view === 'dashboard' ? `Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}, ${(user?.name || 'learner').split(' ')[0]}.` : pageTitle}</h1></div>
          <div className="topbar-actions"><span className="today-label">{new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date())}</span><button className="icon-button" onClick={() => setView('profile')} aria-label="Profile settings">{(user?.name || 'S').slice(0, 1).toUpperCase()}</button></div>
        </header>

        {view === 'dashboard' && <Dashboard dashboard={dashboard} onView={setView} onToggle={toggleTask} onEdit={editTask} onDelete={deleteTask} />}

        {view === 'subjects' && <section className="page-section">
          <div className="section-heading"><div><h2>Your subjects</h2><p>Build a home for every topic you’re learning.</p></div><span className="count-chip">{dashboard.subjects.length} {dashboard.subjects.length === 1 ? 'subject' : 'subjects'}</span></div>
          <div className="subject-layout">
            <form onSubmit={saveSubject} className="panel form-panel">
              <h3>{editingSubject ? 'Edit subject' : 'Add a subject'}</h3><p className="muted">Keep your learning organized by topic.</p>
              <div className="form-stack"><Field label="Subject name"><input required value={subjectForm.name} onChange={(event) => setSubjectForm({ ...subjectForm, name: event.target.value })} placeholder="e.g. Data structures" /></Field><Field label="Description"><textarea rows="3" value={subjectForm.description} onChange={(event) => setSubjectForm({ ...subjectForm, description: event.target.value })} placeholder="What are you focusing on?" /></Field><button disabled={busy} className="button button-primary">{editingSubject ? 'Save changes' : 'Create subject'} <span>→</span></button>{editingSubject && <button type="button" className="button button-quiet" onClick={() => { setEditingSubject(null); setSubjectForm({ name: '', description: '' }); }}>Cancel edit</button>}</div>
            </form>
            <div className="subject-grid">{dashboard.subjectProgress.length ? dashboard.subjectProgress.map(({ subject, totalTasks, completedTasks, pendingTasks, progress }) => <article className="panel subject-card" key={subject._id}><div className="subject-card-top"><div className="subject-symbol">{subject.name.slice(0, 1).toUpperCase()}</div><div className="subject-actions"><button onClick={() => { setEditingSubject(subject); setSubjectForm({ name: subject.name, description: subject.description || '' }); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Edit</button><button className="danger-text" onClick={() => deleteSubject(subject)}>Delete</button></div></div><h3>{subject.name}</h3><p className="subject-description">{subject.description || 'A space for your notes, practice, and progress.'}</p><div className="progress-meta"><span>{completedTasks} of {totalTasks} completed</span><strong>{progress}%</strong></div><Progress value={progress} /><div className="subject-foot"><span>{pendingTasks} remaining</span><button onClick={() => { setFilters({ ...filters, subjectId: subject._id }); setView('tasks'); }}>View tasks →</button></div></article>) : <EmptyState icon="▤" title="Start with a subject" text="Create your first subject to organize related study tasks." />}</div>
          </div>
        </section>}

        {view === 'tasks' && <section className="page-section">
          <div className="section-heading"><div><h2>Your study list</h2><p>Plan the next step, then give it your focus.</p></div><button className="button button-primary" onClick={() => { setEditingTask(null); setTaskForm(initialTask); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>＋ Add task</button></div>
          <form onSubmit={saveTask} className="panel task-composer"><div><p className="eyebrow">{editingTask ? 'UPDATE STUDY TASK' : 'MAKE A PLAN'}</p><h3>{editingTask ? 'Edit task details' : 'Add a study task'}</h3></div><div className="composer-fields"><Field label="Task title"><input required value={taskForm.title} onChange={(event) => setTaskForm({ ...taskForm, title: event.target.value })} placeholder="What do you want to work on?" /></Field><Field label="Subject"><select value={taskForm.subjectId} onChange={(event) => setTaskForm({ ...taskForm, subjectId: event.target.value })}><option value="">No subject</option>{dashboard.subjects.map((subject) => <option key={subject._id} value={subject._id}>{subject.name}</option>)}</select></Field><Field label="Priority"><select value={taskForm.priority} onChange={(event) => setTaskForm({ ...taskForm, priority: event.target.value })}><option>Low</option><option>Medium</option><option>High</option></select></Field><Field label="Due date"><input type="date" value={taskForm.deadline} onChange={(event) => setTaskForm({ ...taskForm, deadline: event.target.value })} /></Field><Field label="Estimate (minutes)"><input type="number" min="1" value={taskForm.estimateMinutes} onChange={(event) => setTaskForm({ ...taskForm, estimateMinutes: event.target.value })} placeholder="Optional" /></Field><Field label="Details"><input value={taskForm.description} onChange={(event) => setTaskForm({ ...taskForm, description: event.target.value })} placeholder="A little context (optional)" /></Field></div><div className="composer-actions"><button className="button button-primary" disabled={busy}>{editingTask ? 'Save task' : 'Add to my tasks'} <span>→</span></button>{editingTask && <button type="button" className="button button-quiet" onClick={() => { setEditingTask(null); setTaskForm(initialTask); }}>Cancel</button>}</div></form>
          <div className="filter-row"><input aria-label="Search tasks" value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} placeholder="⌕  Search your tasks" /><select aria-label="Filter by subject" value={filters.subjectId} onChange={(event) => setFilters({ ...filters, subjectId: event.target.value })}><option value="all">All subjects</option>{dashboard.subjects.map((subject) => <option key={subject._id} value={subject._id}>{subject.name}</option>)}</select><select aria-label="Filter by status" value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}><option value="all">All statuses</option><option value="pending">To do</option><option value="completed">Completed</option></select><select aria-label="Filter by priority" value={filters.priority} onChange={(event) => setFilters({ ...filters, priority: event.target.value })}><option value="all">All priorities</option><option>High</option><option>Medium</option><option>Low</option></select><select aria-label="Sort tasks" value={filters.sort} onChange={(event) => setFilters({ ...filters, sort: event.target.value })}><option value="recent">Recently added</option><option value="deadline">Due date</option><option value="priority">Priority</option></select></div>
          <div className="task-list">{visibleTasks.length ? visibleTasks.map((task) => <TaskRow key={task._id} task={task} onToggle={toggleTask} onEdit={editTask} onDelete={deleteTask} />) : <EmptyState icon="✓" title="Nothing here just yet" text="Try changing your filters or add a study task to get started." />}</div>
        </section>}

        {view === 'planner' && <section className="page-section planner-page">
          <div className="planner-hero"><div className="sparkle">✳</div><p className="eyebrow">YOUR LEARNING, WITH A PLAN</p><h2>Big goal. Clear next steps.</h2><p>Tell StudyMate what you want to learn. Your AI planner will turn it into a realistic sequence of activities, shaped around your level and time.</p></div>
          <div className="planner-layout"><form onSubmit={generatePlan} className="panel planner-form"><h3>Set your learning goal</h3><div className="form-stack"><Field label="What do you want to learn?"><input required maxLength="120" value={plannerForm.topic} onChange={(event) => setPlannerForm({ ...plannerForm, topic: event.target.value })} placeholder="e.g. SQL joins and database design" /></Field><Field label="What do you want to achieve?"><textarea required maxLength="500" rows="3" value={plannerForm.goal} onChange={(event) => setPlannerForm({ ...plannerForm, goal: event.target.value })} placeholder="Describe a practical outcome you’re working towards…" /></Field><div className="form-two"><Field label="Current level"><select value={plannerForm.currentLevel} onChange={(event) => setPlannerForm({ ...plannerForm, currentLevel: event.target.value })}><option>Beginner</option><option>Intermediate</option><option>Advanced</option></select></Field><Field label="Available study time"><input required value={plannerForm.availableTime} onChange={(event) => setPlannerForm({ ...plannerForm, availableTime: event.target.value })} placeholder="e.g. 1 hour per day" /></Field></div><Field label="Target date (optional)"><input type="date" value={plannerForm.deadline} onChange={(event) => setPlannerForm({ ...plannerForm, deadline: event.target.value })} /></Field><button className="button button-primary button-wide" disabled={busy}>{busy ? <><span className="spinner" /> Building your plan…</> : <>✳ &nbsp; Generate my plan</>}</button><p className="form-note">Your plan is only saved when you choose “Save plan”.</p></div></form>
            <div className="planner-aside"><div className="panel guidance-card"><span className="guidance-icon">✦</span><h3>Made for your real life</h3><p>Get clear steps, practical exercises, and time estimates that fit your level and schedule.</p><ul><li>Specific, ordered learning activities</li><li>Practice built into each step</li><li>Honest guidance if a goal needs adjusting</li></ul></div><div className="privacy-note">⌁ &nbsp;Your learning goals stay private to your account.</div></div></div>
          {generatedPlan && <PlanCard plan={generatedPlan} generated selected={selectedActivities} onSelect={setSelectedActivities} onSave={savePlan} busy={busy} />}
        </section>}

        {view === 'plans' && <section className="page-section">
          <div className="section-heading"><div><h2>Your plan library</h2><p>Keep your learning roadmaps close, and choose what becomes a task.</p></div><button className="button button-primary" onClick={() => { setView('planner'); setGeneratedPlan(null); }}>✳ Create a plan</button></div>
          <div className="import-toolbar"><label>Send activities to subject <select value={importSubject} onChange={(event) => setImportSubject(event.target.value)}><option value="">No subject</option>{dashboard.subjects.map((subject) => <option key={subject._id} value={subject._id}>{subject.name}</option>)}</select></label></div>
          <div className="saved-plans">{dashboard.studyPlans.length ? dashboard.studyPlans.map((plan) => <div key={plan._id} className="saved-plan"><PlanCard plan={plan} onDelete={() => deletePlan(plan)} selected={selectedActivities} onSelect={setSelectedActivities} onImport={importSelected} onImportOne={importActivity} busy={busy} /><div className="plan-subject-picker"><span>Activities will use</span><select aria-label="Subject for imported tasks" value={importSubject} onChange={(event) => setImportSubject(event.target.value)}><option value="">No subject</option>{dashboard.subjects.map((subject) => <option key={subject._id} value={subject._id}>{subject.name}</option>)}</select></div></div>) : <EmptyState icon="▧" title="Your library is ready" text="Generate a personalized study plan and save it here whenever you’re ready." action={<button className="button button-primary" onClick={() => setView('planner')}>Create your first plan →</button>} />}</div>
        </section>}

        {view === 'profile' && <section className="page-section profile-page"><div className="section-heading"><div><h2>Your account</h2><p>Keep your personal details up to date.</p></div></div><form onSubmit={saveProfile} className="panel profile-form"><div className="profile-avatar">{(user?.name || 'S').slice(0, 1).toUpperCase()}</div><Field label="Full name"><input required value={profileForm.name} onChange={(event) => setProfileForm({ ...profileForm, name: event.target.value })} /></Field><Field label="Email address"><input type="email" required value={profileForm.email} onChange={(event) => setProfileForm({ ...profileForm, email: event.target.value })} /></Field><div className="profile-buttons"><button className="button button-primary">Save profile</button><button type="button" className="button button-quiet" onClick={logout}>Sign out</button></div></form></section>}
        <footer className="page-footer"><span>StudyMate</span><span>Make space for steady progress.</span></footer>
      </main>
      {notice && <Notice notice={notice} />}
    </div>
  );
}

function Field({ label, children }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

function Progress({ value }) {
  return <div className="progress-track"><span style={{ width: `${value}%` }} /></div>;
}

function EmptyState({ icon, title, text, action }) {
  return <div className="empty-state"><span className="empty-icon">{icon}</span><h3>{title}</h3><p>{text}</p>{action}</div>;
}

function Notice({ notice }) {
  return <div className={`toast ${notice.type === 'error' ? 'toast-error' : ''}`} role="status"><span>{notice.type === 'error' ? '!' : '✓'}</span>{notice.message}</div>;
}

function TaskRow({ task, onToggle, onEdit, onDelete, compact = false }) {
  const deadlineState = getDeadlineState(task);
  return <article className={`task-row ${task.completed ? 'is-complete' : ''} ${compact ? 'compact' : ''}`}><button className={`task-check ${task.completed ? 'checked' : ''}`} aria-label={task.completed ? 'Reopen task' : 'Complete task'} onClick={() => onToggle(task)}>{task.completed ? '✓' : ''}</button><div className="task-main"><strong>{task.title}</strong>{!compact && task.description && <p>{task.description}</p>}<div className="task-meta"><span>{task.subjectId?.name || 'Personal'}</span><span className={`priority priority-${task.priority.toLowerCase()}`}>{task.priority}</span>{task.estimateMinutes && <span>{task.estimateMinutes} min</span>}<span className={deadlineState === 'Overdue' ? 'overdue-label' : ''}>{formatDate(task.deadline)}</span>{deadlineState && <span className={`deadline-chip ${deadlineState === 'Overdue' ? 'late' : ''}`}>{deadlineState}</span>}</div></div><div className="task-actions"><button onClick={() => onEdit(task)} aria-label="Edit task">Edit</button><button className="danger-text" onClick={() => onDelete(task)} aria-label="Delete task">Delete</button></div></article>;
}

function Dashboard({ dashboard, onView, onToggle, onEdit, onDelete }) {
  const { stats, upcomingTasks, overdueTasks, recentTasks, subjectProgress } = dashboard;
  return <section className="dashboard-content">
    <div className="welcome-banner"><div><p className="eyebrow">A FRESH PAGE, EVERY DAY</p><h2>Progress starts with one focused step.</h2><p>Your learning space is ready when you are. Take a look at what’s next.</p><button className="button button-light" onClick={() => onView('tasks')}>View my study list <span>→</span></button></div><div className="banner-art"><div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" /><div className="art-book">✦<small>LEARN<br />GROW</small></div><span className="art-dot dot-one">✳</span><span className="art-dot dot-two">·</span></div></div>
    <div className="stats-grid"><StatCard icon="▤" label="Subjects" value={stats.totalSubjects} detail="Topics in your workspace" tone="lavender" /><StatCard icon="◷" label="To do" value={stats.pendingTasks} detail="One step at a time" tone="peach" /><StatCard icon="✓" label="Completed" value={stats.completedTasks} detail="Look how far you’ve come" tone="mint" /><StatCard icon="↗" label="Overall progress" value={`${stats.completionRate}%`} detail={`${stats.totalTasks} total study tasks`} tone="blue" /></div>
    <div className="dashboard-grid">
      <section className="panel dashboard-panel"><div className="panel-heading"><div><h3>Coming up</h3><p>Your next seven days, at a glance</p></div><button className="text-link" onClick={() => onView('tasks')}>All tasks →</button></div>{overdueTasks.length > 0 && <><div className="attention-box"><span>!</span><div><strong>{overdueTasks.length} overdue task{overdueTasks.length === 1 ? '' : 's'}</strong><p>A little attention here can help you get back on track.</p></div></div><div className="upcoming-list overdue-list">{overdueTasks.slice(0, 3).map((task) => <div key={task._id} className="upcoming-item"><div className="date-block"><strong>{new Date(task.deadline).getDate()}</strong><span>{new Intl.DateTimeFormat(undefined, { month: 'short' }).format(new Date(task.deadline))}</span></div><div><strong>{task.title}</strong><small>{task.subjectId?.name || 'Personal'} · overdue</small></div><span className="deadline-chip late">Late</span></div>)}</div></>}{upcomingTasks.length ? <div className="upcoming-list">{upcomingTasks.slice(0, 5).map((task) => <div key={task._id} className="upcoming-item"><div className="date-block"><strong>{new Date(task.deadline).getDate()}</strong><span>{new Intl.DateTimeFormat(undefined, { month: 'short' }).format(new Date(task.deadline))}</span></div><div><strong>{task.title}</strong><small>{task.subjectId?.name || 'Personal'} · {task.priority} priority</small></div><span className="upcoming-arrow">↗</span></div>)}</div> : <EmptyState icon="◷" title="No upcoming deadlines" text="No tasks are due in the next week." />}</section>
      <section className="panel dashboard-panel"><div className="panel-heading"><div><h3>Subject progress</h3><p>Keep your learning moving forward</p></div><button className="text-link" onClick={() => onView('subjects')}>All subjects →</button></div>{subjectProgress.length ? <div className="subject-progress-list">{subjectProgress.slice(0, 5).map(({ subject, totalTasks, completedTasks, progress }) => <div className="subject-progress-row" key={subject._id}><div className="subject-progress-heading"><span>{subject.name}</span><span>{completedTasks}/{totalTasks} <strong>{progress}%</strong></span></div><Progress value={progress} /></div>)}</div> : <EmptyState icon="▤" title="Your subjects live here" text="Add a subject to see your learning progress." action={<button className="text-link" onClick={() => onView('subjects')}>Add your first subject →</button>} />}</section>
    </div>
    <section className="panel recent-panel"><div className="panel-heading"><div><h3>Recently added</h3><p>Your newest study tasks</p></div><button className="text-link" onClick={() => onView('tasks')}>Open study list →</button></div>{recentTasks.length ? <div className="task-list compact-list">{recentTasks.map((task) => <TaskRow key={task._id} task={task} onToggle={onToggle} onEdit={onEdit} onDelete={onDelete} compact />)}</div> : <EmptyState icon="✎" title="Your first step is waiting" text="Add a study task or create a subject to get started." action={<button className="button button-primary" onClick={() => onView('tasks')}>Add a task →</button>} />}</section>
    <div className="dashboard-bottom"><div className="progress-callout"><span className="callout-icon">✦</span><div><strong>{stats.completionRate}% of your tasks complete</strong><p>Every finished task is progress worth recognizing.</p></div><Progress value={stats.completionRate} /></div><button className="ai-cta" onClick={() => onView('planner')}><span>✳</span><strong>Not sure where to start?</strong><small>Let your AI planner break it down.</small><b>Make a learning plan →</b></button></div>
  </section>;
}

function StatCard({ icon, label, value, detail, tone }) {
  return <article className={`stat-card ${tone}`}><div className="stat-icon">{icon}</div><span className="stat-label">{label}</span><strong className="stat-value">{value}</strong><small>{detail}</small></article>;
}

function PlanCard({ plan, generated = false, selected = [], onSelect = () => {}, onSave, onDelete, onImport, onImportOne, busy }) {
  const toggle = (index) => onSelect(selected.includes(index) ? selected.filter((item) => item !== index) : [...selected, index]);
  return <article className="panel plan-card"><div className="plan-card-heading"><div><p className="eyebrow">{generated ? 'YOUR NEW LEARNING ROADMAP' : `SAVED ${formatDate(plan.createdAt).toUpperCase()}`}</p><h3>{plan.topic}</h3><p className="plan-goal">{plan.goal}</p></div>{onDelete && <button className="danger-text" onClick={onDelete}>Delete plan</button>}</div><div className="plan-context"><span>{plan.currentLevel}</span><span>{plan.availableTime}</span>{plan.deadline && <span>Target · {formatDate(plan.deadline)}</span>}</div><div className="plan-outcome"><span className="outcome-icon">✦</span><div><strong>Learning objective</strong><p>{plan.learningObjective}</p><strong>By the end, you’ll be able to</strong><p>{plan.expectedOutcome}</p>{plan.feasibilityNote && <div className="feasibility-note">A realistic note: {plan.feasibilityNote}</div>}</div></div><div className="plan-activities-heading"><h4>Your learning path <span>{plan.activities.length} activities</span></h4>{!generated && onImport && <button className="button button-secondary button-small" disabled={busy || selected.length === 0} onClick={() => onImport(plan)}>Add selected ({selected.length})</button>}</div><div className="activity-list">{plan.activities.map((activity, index) => <div className="activity-item" key={`${activity.title}-${index}`}><label className="activity-select"><input type="checkbox" checked={selected.includes(index)} onChange={() => toggle(index)} aria-label={`Select ${activity.title}`} /><span className="activity-number">{String(index + 1).padStart(2, '0')}</span></label><div className="activity-content"><div className="activity-title-row"><h4>{activity.title}</h4><span className="duration-chip">◷ {activity.durationMinutes} min</span></div><p>{activity.description}</p>{activity.exercises?.length > 0 && <div className="exercise-note"><strong>Try it:</strong> {activity.exercises.join(' · ')}</div>}</div>{!generated && onImportOne && <button className="activity-add" onClick={() => onImportOne(plan, index)} aria-label={`Add ${activity.title} as a task`}>＋</button>}</div>)}</div><div className="plan-card-footer">{generated ? <><span>Review your activities — saving won’t add them to your tasks.</span><button className="button button-primary" disabled={busy} onClick={onSave}>{busy ? 'Saving…' : 'Save this plan'} <span>→</span></button></> : <span>Select only the activities you’re ready to add to your study list.</span>}</div></article>;
}

export default App;
