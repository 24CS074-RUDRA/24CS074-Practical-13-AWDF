/* ═══════════════════════════════════════════════════════════════
   TaskFlow — Frontend Application Logic
   Practical 7: Authentication & Middleware Pipeline
   ═══════════════════════════════════════════════════════════════ */

const API_BASE = window.location.origin + '/api';

// ── State ────────────────────────────────────────────────────────
let tasks = [];
let currentFilter = 'all';
let deleteTargetId = null;

// ── Helpers ──────────────────────────────────────────────────────

/** Get stored JWT token */
function getToken() {
  return localStorage.getItem('token');
}

/** Get stored user info */
function getUser() {
  const raw = localStorage.getItem('user');
  return raw ? JSON.parse(raw) : null;
}

/** Save auth data after login */
function saveAuth(token, user) {
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
}

/** Clear auth data (logout) */
function clearAuth() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
}

/** Make an authenticated API request.
 *  Automatically attaches Bearer token and handles 401 → redirect to login.
 */
async function apiFetch(url, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${url}`, { ...options, headers });

  // ── 401 Handling: redirect to login if token is expired/invalid ──
  if (res.status === 401) {
    clearAuth();
    showView('auth');
    showToast('Session expired. Please login again.', 'error');
    throw new Error('Unauthorized');
  }

  return res;
}

/** Show a toast notification */
function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast ${type} show`;

  setTimeout(() => {
    toast.classList.remove('show');
  }, 3500);
}

/** Switch between views */
function showView(viewName) {
  document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
  document.getElementById(`${viewName}-view`).classList.add('active');
}

/** Toggle loading state on a button */
function setButtonLoading(btn, loading) {
  if (loading) {
    btn.classList.add('loading');
    btn.disabled = true;
  } else {
    btn.classList.remove('loading');
    btn.disabled = false;
  }
}

// ── Auth Tab Switching ───────────────────────────────────────────

function switchAuthTab(tab) {
  const loginTab = document.getElementById('login-tab');
  const registerTab = document.getElementById('register-tab');
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const indicator = document.getElementById('tab-indicator');

  if (tab === 'login') {
    loginTab.classList.add('active');
    registerTab.classList.remove('active');
    loginForm.classList.add('active');
    registerForm.classList.remove('active');
    indicator.classList.remove('right');
  } else {
    registerTab.classList.add('active');
    loginTab.classList.remove('active');
    registerForm.classList.add('active');
    loginForm.classList.remove('active');
    indicator.classList.add('right');
  }
}

// ── Authentication ───────────────────────────────────────────────

async function handleRegister(e) {
  e.preventDefault();
  const btn = document.getElementById('register-btn');
  setButtonLoading(btn, true);

  try {
    const name = document.getElementById('register-name').value.trim();
    const email = document.getElementById('register-email').value.trim();
    const password = document.getElementById('register-password').value;

    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
    });

    const data = await res.json();

    if (!res.ok) {
      const msg = data.details
        ? data.details.map((d) => d.message).join(', ')
        : data.error;
      showToast(msg, 'error');
      return;
    }

    showToast('Account created! Please sign in.', 'success');
    switchAuthTab('login');
    document.getElementById('register-form').reset();
  } catch (err) {
    showToast('Network error. Please try again.', 'error');
  } finally {
    setButtonLoading(btn, false);
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const btn = document.getElementById('login-btn');
  setButtonLoading(btn, true);

  try {
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;

    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();

    if (!res.ok) {
      const msg = data.details
        ? data.details.map((d) => d.message).join(', ')
        : data.error;
      showToast(msg, 'error');
      return;
    }

    // Save token and user to localStorage
    saveAuth(data.token, data.user);
    showToast(`Welcome back, ${data.user.name || data.user.email}!`, 'success');
    document.getElementById('login-form').reset();
    initDashboard();
  } catch (err) {
    showToast('Network error. Please try again.', 'error');
  } finally {
    setButtonLoading(btn, false);
  }
}

/** Logout — clears token from client (supplementary requirement) */
function handleLogout() {
  clearAuth();
  showView('auth');
  showToast('Logged out successfully.', 'info');
}

// ── Dashboard Initialization ─────────────────────────────────────

function initDashboard() {
  const user = getUser();
  if (!user) {
    showView('auth');
    return;
  }

  // Update user info in header
  const nameDisplay = user.name || user.email.split('@')[0];
  document.getElementById('user-name').textContent = nameDisplay;
  document.getElementById('user-avatar').textContent = nameDisplay.charAt(0).toUpperCase();

  showView('dashboard');
  fetchTasks();
}

// ── Task CRUD ────────────────────────────────────────────────────

async function fetchTasks() {
  const taskList = document.getElementById('task-list');
  const loadingState = document.getElementById('loading-state');
  const emptyState = document.getElementById('empty-state');

  taskList.innerHTML = '';
  loadingState.style.display = 'block';
  emptyState.style.display = 'none';

  try {
    const res = await apiFetch('/tasks');
    const data = await res.json();
    tasks = data;
    renderTasks();
    updateStats();
  } catch (err) {
    if (err.message !== 'Unauthorized') {
      showToast('Failed to load tasks.', 'error');
    }
  } finally {
    loadingState.style.display = 'none';
  }
}

async function handleCreateTask(e) {
  e.preventDefault();
  const btn = document.getElementById('create-task-btn');
  setButtonLoading(btn, true);

  try {
    const title = document.getElementById('task-title').value.trim();
    const description = document.getElementById('task-description').value.trim();
    const priority = document.getElementById('task-priority').value;

    const res = await apiFetch('/tasks', {
      method: 'POST',
      body: JSON.stringify({ title, description, priority }),
    });

    const data = await res.json();

    if (!res.ok) {
      const msg = data.details
        ? data.details.map((d) => d.message).join(', ')
        : data.error;
      showToast(msg, 'error');
      return;
    }

    // Update local state and re-render
    tasks.unshift(data);
    renderTasks();
    updateStats();
    document.getElementById('task-form').reset();
    showToast('Task created!', 'success');
  } catch (err) {
    if (err.message !== 'Unauthorized') {
      showToast('Failed to create task.', 'error');
    }
  } finally {
    setButtonLoading(btn, false);
  }
}

function openEditModal(taskId) {
  const task = tasks.find((t) => t._id === taskId);
  if (!task) return;

  document.getElementById('edit-task-id').value = task._id;
  document.getElementById('edit-title').value = task.title;
  document.getElementById('edit-description').value = task.description || '';
  document.getElementById('edit-status').value = task.status;
  document.getElementById('edit-priority').value = task.priority;

  document.getElementById('edit-modal').style.display = 'flex';
}

function closeEditModal() {
  document.getElementById('edit-modal').style.display = 'none';
}

async function handleUpdateTask(e) {
  e.preventDefault();
  const btn = e.target.querySelector('.btn-primary');
  setButtonLoading(btn, true);

  const id = document.getElementById('edit-task-id').value;
  const title = document.getElementById('edit-title').value.trim();
  const description = document.getElementById('edit-description').value.trim();
  const status = document.getElementById('edit-status').value;
  const priority = document.getElementById('edit-priority').value;

  try {
    const res = await apiFetch(`/tasks/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ title, description, status, priority }),
    });

    const data = await res.json();

    if (!res.ok) {
      const msg = data.details
        ? data.details.map((d) => d.message).join(', ')
        : data.error;
      showToast(msg, 'error');
      return;
    }

    // Update local state
    const idx = tasks.findIndex((t) => t._id === id);
    if (idx !== -1) tasks[idx] = data;

    renderTasks();
    updateStats();
    closeEditModal();
    showToast('Task updated!', 'success');
  } catch (err) {
    if (err.message !== 'Unauthorized') {
      showToast('Failed to update task.', 'error');
    }
  } finally {
    setButtonLoading(btn, false);
  }
}

function openDeleteModal(taskId) {
  deleteTargetId = taskId;
  document.getElementById('delete-modal').style.display = 'flex';
}

function closeDeleteModal() {
  deleteTargetId = null;
  document.getElementById('delete-modal').style.display = 'none';
}

async function confirmDelete() {
  if (!deleteTargetId) return;
  const btn = document.getElementById('confirm-delete-btn');
  setButtonLoading(btn, true);

  try {
    const res = await apiFetch(`/tasks/${deleteTargetId}`, {
      method: 'DELETE',
    });

    if (!res.ok) {
      showToast('Failed to delete task.', 'error');
      return;
    }

    // Remove from local state
    tasks = tasks.filter((t) => t._id !== deleteTargetId);
    renderTasks();
    updateStats();
    closeDeleteModal();
    showToast('Task deleted.', 'success');
  } catch (err) {
    if (err.message !== 'Unauthorized') {
      showToast('Failed to delete task.', 'error');
    }
  } finally {
    setButtonLoading(btn, false);
  }
}

// ── Rendering ────────────────────────────────────────────────────

function renderTasks() {
  const taskList = document.getElementById('task-list');
  const emptyState = document.getElementById('empty-state');

  // Apply filter
  const filtered =
    currentFilter === 'all'
      ? tasks
      : tasks.filter((t) => t.status === currentFilter);

  if (filtered.length === 0) {
    taskList.innerHTML = '';
    emptyState.style.display = 'block';
    return;
  }

  emptyState.style.display = 'none';

  taskList.innerHTML = filtered
    .map(
      (task) => `
    <div class="task-card ${task.status === 'completed' ? 'completed' : ''}" data-id="${task._id}">
      <div class="task-content">
        <div class="task-title">${escapeHtml(task.title)}</div>
        ${task.description ? `<div class="task-description">${escapeHtml(task.description)}</div>` : ''}
        <div class="task-meta">
          <span class="badge badge-status-${task.status}">${formatStatus(task.status)}</span>
          <span class="badge badge-priority-${task.priority}">${task.priority}</span>
        </div>
      </div>
      <div class="task-actions">
        <button class="btn-icon edit" title="Edit" onclick="openEditModal('${task._id}')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
        <button class="btn-icon delete" title="Delete" onclick="openDeleteModal('${task._id}')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
        </button>
      </div>
    </div>
  `
    )
    .join('');
}

function formatStatus(status) {
  const map = {
    pending: 'Pending',
    'in-progress': 'In Progress',
    completed: 'Completed',
  };
  return map[status] || status;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function updateStats() {
  document.getElementById('stat-total').textContent = tasks.length;
  document.getElementById('stat-pending').textContent = tasks.filter(
    (t) => t.status === 'pending'
  ).length;
  document.getElementById('stat-progress').textContent = tasks.filter(
    (t) => t.status === 'in-progress'
  ).length;
  document.getElementById('stat-completed').textContent = tasks.filter(
    (t) => t.status === 'completed'
  ).length;
}

function filterTasks(filter) {
  currentFilter = filter;

  document.querySelectorAll('.filter-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.filter === filter);
  });

  renderTasks();
}

// ── Close modals on backdrop click ───────────────────────────────
document.getElementById('edit-modal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeEditModal();
});

document.getElementById('delete-modal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeDeleteModal();
});

// ── Startup ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const token = getToken();
  if (token) {
    initDashboard();
  } else {
    showView('auth');
  }
});
