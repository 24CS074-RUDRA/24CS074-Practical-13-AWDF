import React, { useState, useEffect } from 'react';

const API_BASE = '/api';

function Home() {
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('user');
    return saved ? JSON.parse(saved) : null;
  });

  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Form states for creating task
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiFeedback, setAiFeedback] = useState(null);
  const [priority, setPriority] = useState('medium');
  const [filter, setFilter] = useState('all');

  // Auth form state
  const [authMode, setAuthMode] = useState('login'); // 'login' or 'register'
  const [authName, setAuthName] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');

  // Fetch live tasks from MongoDB backend API
  const fetchTasks = async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/tasks`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (res.status === 401) {
        handleLogout();
        setError('Session expired. Please log in again.');
        return;
      }

      const data = await res.json();
      if (res.ok) {
        setTasks(data);
      } else {
        setError(data.error || 'Failed to fetch tasks');
      }
    } catch (err) {
      setError('Cannot connect to MongoDB backend server.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchTasks();
    }
  }, [token]);

  // Auth handlers
  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const endpoint = authMode === 'login' ? '/auth/login' : '/auth/register';
    const payload = authMode === 'login'
      ? { email: authEmail, password: authPassword }
      : { name: authName, email: authEmail, password: authPassword };

    try {
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) {
        const msg = data.details ? data.details.map(d => d.message).join(', ') : data.error;
        setError(msg || 'Authentication failed');
        return;
      }

      if (authMode === 'register') {
        setAuthMode('login');
        setError('Registration successful! Please log in.');
      } else {
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        setToken(data.token);
        setUser(data.user);
      }
    } catch (err) {
      setError('Network error connecting to auth service.');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken('');
    setUser(null);
    setTasks([]);
  };

  const handleGenerateDescription = async () => {
    if (!title.trim() || aiLoading) return;

    setAiLoading(true);
    setAiFeedback(null);

    try {
      const res = await fetch(`${API_BASE}/ai/generate-description`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token,
        },
        body: JSON.stringify({ title })
      });
      const data = await res.json();

      if (res.status === 401) {
        handleLogout();
        setAiFeedback({
          kind: 'fallback',
          message: 'Your session expired. Sign in again to request an AI suggestion.'
        });
        return;
      }

      if (!res.ok) {
        setAiFeedback({ kind: 'fallback', message: data.error || 'Could not generate a description.' });
        return;
      }

      if (data.description) {
        setDescription(data.description);
      }
      setAiFeedback({
        kind: data.fallback ? 'fallback' : 'success',
        message: data.message
      });
    } catch (err) {
      setAiFeedback({
        kind: 'fallback',
        message: 'Could not reach the AI service. You can still write a description and add the task.'
      });
    } finally {
      setAiLoading(false);
    }
  };

  // Create Task in MongoDB via backend API
  const handleCreateTask = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;

    try {
      const res = await fetch(`${API_BASE}/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ title, description, priority })
      });

      const data = await res.json();
      if (res.ok) {
        setTasks([data, ...tasks]);
        setTitle('');
        setDescription('');
        setPriority('medium');
      } else {
        setError(data.error || 'Failed to create task');
      }
    } catch (err) {
      setError('Error creating task in MongoDB.');
    }
  };

  // Toggle Status in MongoDB via backend API
  const handleToggleStatus = async (task) => {
    const nextStatus = task.status === 'pending' ? 'in-progress' : task.status === 'in-progress' ? 'completed' : 'pending';

    try {
      const res = await fetch(`${API_BASE}/tasks/${task._id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          title: task.title,
          description: task.description,
          status: nextStatus,
          priority: task.priority
        })
      });

      const updated = await res.json();
      if (res.ok) {
        setTasks(tasks.map(t => t._id === task._id ? updated : t));
      } else {
        setError(updated.error || 'Failed to update task status');
      }
    } catch (err) {
      setError('Error updating task in MongoDB.');
    }
  };

  // Delete Task in MongoDB via backend API
  const handleDeleteTask = async (id) => {
    try {
      const res = await fetch(`${API_BASE}/tasks/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (res.ok) {
        setTasks(tasks.filter(t => t._id !== id));
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to delete task');
      }
    } catch (err) {
      setError('Error deleting task from MongoDB.');
    }
  };

  const filteredTasks = filter === 'all'
    ? tasks
    : tasks.filter(t => t.status === filter);
  const taskCounts = {
    all: tasks.length,
    pending: tasks.filter((task) => task.status === 'pending').length,
    'in-progress': tasks.filter((task) => task.status === 'in-progress').length,
    completed: tasks.filter((task) => task.status === 'completed').length,
  };

  if (!token) {
    return (
      <div className="auth-layout">
        <section className="auth-showcase">
          <div className="showcase-brand">
            <span className="brand-mark">T</span>
            <span>Taskflow</span>
          </div>
          <div className="showcase-copy">
            <span className="eyebrow">A little more focus</span>
            <h1>Make room for the work that matters.</h1>
            <p>One calm space to collect your tasks, set priorities, and keep moving forward.</p>
            <div className="showcase-note">
              <span className="note-check">✓</span>
              <span>Small steps add up. Start with one.</span>
            </div>
          </div>
          <div className="showcase-decoration" aria-hidden="true">
            <div className="decoration-card decoration-card-back">A clear mind starts here</div>
            <div className="decoration-card decoration-card-front">
              <span className="decoration-check">✓</span>
              <span>Plan your next win</span>
              <span className="decoration-lines"><i /><i /><i /></span>
            </div>
          </div>
          <span className="showcase-footer">YOUR DAY, WITH A LITTLE MORE INTENTION.</span>
        </section>

        <section className="auth-panel">
          <div className="auth-panel-inner">
            <span className="eyebrow auth-eyebrow">YOUR PERSONAL WORKSPACE</span>
            <h2>{authMode === 'login' ? 'Welcome back' : 'Create your account'}</h2>
            <p className="auth-intro">
              {authMode === 'login'
                ? 'Sign in to pick up right where you left off.'
                : 'A fresh start for your plans and priorities.'}
            </p>

            {error && <div className="notice notice-error" role="alert">{error}</div>}

            <form onSubmit={handleAuthSubmit} className="auth-form">
              {authMode === 'register' && (
                <div className="form-group">
                  <label htmlFor="auth-name">Full name</label>
                  <input
                    id="auth-name"
                    type="text"
                    className="input-field"
                    placeholder="How should we call you?"
                    value={authName}
                    onChange={(e) => setAuthName(e.target.value)}
                    autoComplete="name"
                    required
                  />
                </div>
              )}
              <div className="form-group">
                <label htmlFor="auth-email">Email address</label>
                <input
                  id="auth-email"
                  type="email"
                  className="input-field"
                  placeholder="you@example.com"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="auth-password">Password</label>
                <input
                  id="auth-password"
                  type="password"
                  className="input-field"
                  placeholder="At least 6 characters"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
                  minLength={6}
                  required
                />
              </div>
              <button type="submit" className="btn btn-primary auth-submit">
                {authMode === 'login' ? 'Sign in to your workspace' : 'Create my account'}
                <span aria-hidden="true">→</span>
              </button>
            </form>

            <p className="auth-switch">
              {authMode === 'login' ? "New to Taskflow?" : 'Already have an account?'}{' '}
              <button
                type="button"
                onClick={() => { setAuthMode(authMode === 'login' ? 'register' : 'login'); setError(''); }}
              >
                {authMode === 'login' ? 'Create an account' : 'Sign in'}
              </button>
            </p>
            <p className="auth-security"><span aria-hidden="true">●</span> Your workspace is private and secure</p>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <header className="dashboard-heading">
        <div>
          <span className="eyebrow">YOUR PERSONAL WORKSPACE</span>
          <h1>{`Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}, ${user?.name?.split(' ')[0] || 'there'}.`}</h1>
          <p>Make today count, one task at a time.</p>
        </div>
        <div className="account-actions">
          <div className="account-avatar" aria-hidden="true">
            {(user?.name || user?.email || 'U').charAt(0).toUpperCase()}
          </div>
          <div className="account-copy">
            <strong>{user?.name || 'Your account'}</strong>
            <span>Workspace member</span>
          </div>
          <button className="btn btn-quiet" onClick={handleLogout}>Sign out</button>
        </div>
      </header>

      {error && <div className="notice notice-error" role="alert">{error}</div>}

      <section className="stats-grid" aria-label="Task overview">
        <article className="stat-card stat-card-total">
          <span className="stat-icon" aria-hidden="true">✳</span>
          <span className="stat-label">All tasks</span>
          <strong className="stat-value">{taskCounts.all}</strong>
          <span className="stat-caption">In your workspace</span>
        </article>
        <article className="stat-card stat-card-progress">
          <span className="stat-icon" aria-hidden="true">↗</span>
          <span className="stat-label">In progress</span>
          <strong className="stat-value">{taskCounts['in-progress']}</strong>
          <span className="stat-caption">Moving forward</span>
        </article>
        <article className="stat-card stat-card-pending">
          <span className="stat-icon" aria-hidden="true">◷</span>
          <span className="stat-label">To do</span>
          <strong className="stat-value">{taskCounts.pending}</strong>
          <span className="stat-caption">Ready when you are</span>
        </article>
        <article className="stat-card stat-card-complete">
          <span className="stat-icon" aria-hidden="true">✓</span>
          <span className="stat-label">Completed</span>
          <strong className="stat-value">{taskCounts.completed}</strong>
          <span className="stat-caption">Things you've finished</span>
        </article>
      </section>

      <div className="workspace-grid">
        <section className="panel create-panel">
          <div className="panel-heading">
            <span className="panel-kicker">MAKE IT HAPPEN</span>
            <h2>Add a task</h2>
            <p>Get it out of your head and into your plan.</p>
          </div>
          <form onSubmit={handleCreateTask} className="task-form">
            <div className="form-group">
              <label htmlFor="task-title">Task name</label>
              <input
                id="task-title"
                type="text"
                className="input-field"
                placeholder="e.g. Prepare project presentation"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <div className="description-label-row">
                <label htmlFor="task-description">A few details <span>(optional)</span></label>
                <button
                  type="button"
                  className="btn btn-ai"
                  onClick={handleGenerateDescription}
                  disabled={!title.trim() || aiLoading}
                >
                  {aiLoading ? 'Generating…' : '✦ Generate description'}
                </button>
              </div>
              <textarea
                id="task-description"
                className="input-field"
                rows="4"
                placeholder="Add a note to help you get started..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
              <p className="ai-disclaimer">
                AI uses the task title via Gemini. Do not include personal, confidential, or sensitive information.
                Review and edit suggestions before using them.
              </p>
              {aiFeedback && (
                <p className={`ai-feedback ai-feedback-${aiFeedback.kind}`} role="status" aria-live="polite">
                  {aiFeedback.message}
                </p>
              )}
            </div>
            <div className="form-group">
              <label htmlFor="task-priority">Priority</label>
              <select
                id="task-priority"
                className="input-field"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
              >
                <option value="low">Low priority</option>
                <option value="medium">Medium priority</option>
                <option value="high">High priority</option>
              </select>
            </div>
            <button type="submit" className="btn btn-primary create-submit">
              <span aria-hidden="true">＋</span> Add to my tasks
            </button>
          </form>
          <div className="private-note"><span aria-hidden="true">●</span> Only you can see your tasks</div>
        </section>

        <section className="panel task-panel">
          <div className="task-panel-heading">
            <div className="panel-heading">
              <span className="panel-kicker">YOUR PLAN</span>
              <h2>Task list <span className="task-total">{filteredTasks.length}</span></h2>
            </div>
            <button type="button" className="refresh-button" onClick={fetchTasks} disabled={loading} aria-label="Refresh tasks">
              {loading ? 'Loading…' : '↻ Refresh'}
            </button>
          </div>

          <div className="task-filters" aria-label="Filter tasks">
            {['all', 'pending', 'in-progress', 'completed'].map((status) => {
              const labels = { all: 'Everything', pending: 'To do', 'in-progress': 'In progress', completed: 'Done' };
              return (
                <button
                  key={status}
                  type="button"
                  className={`filter-button ${filter === status ? 'is-active' : ''}`}
                  onClick={() => setFilter(status)}
                  aria-pressed={filter === status}
                >
                  {labels[status]}
                  <span>{taskCounts[status]}</span>
                </button>
              );
            })}
          </div>

          {loading ? (
            <div className="task-empty"><span className="loading-dot" /> Gathering your tasks…</div>
          ) : filteredTasks.length === 0 ? (
            <div className="task-empty">
              <span className="empty-icon" aria-hidden="true">✳</span>
              <strong>{filter === 'all' ? 'A fresh page.' : 'Nothing here just yet.'}</strong>
              <p>{filter === 'all' ? 'Add a task to start shaping your day.' : 'Try another filter or add a new task.'}</p>
            </div>
          ) : (
            <div className="task-list">
              {filteredTasks.map((task) => (
                <article className={`task-item task-item-${task.status}`} key={task._id}>
                  <div className="task-marker" aria-hidden="true">
                    {task.status === 'completed' ? '✓' : ''}
                  </div>
                  <div className="task-content">
                    <h3>{task.title}</h3>
                    {task.description && <p>{task.description}</p>}
                    <div className="task-meta">
                      <span className={`status-pill status-${task.status}`}>{task.status === 'in-progress' ? 'In progress' : task.status}</span>
                      <span className={`priority-label priority-${task.priority}`}>{task.priority} priority</span>
                    </div>
                  </div>
                  <div className="task-actions">
                    <button type="button" className="task-action" onClick={() => handleToggleStatus(task)}>
                      Update status
                    </button>
                    <button type="button" className="task-action task-action-delete" onClick={() => handleDeleteTask(task._id)}>
                      Delete
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default Home;
