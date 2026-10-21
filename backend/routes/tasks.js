const express = require('express');
const mongoose = require('mongoose');
const Task = require('../models/Task');
const auth = require('../middleware/auth');
const { validateTask } = require('../middleware/validate');
const cache = require('../utils/cache');
const taskEvents = require('../events');

const router = express.Router();

// ── All task routes are protected by auth middleware ─────────────
router.use(auth);

/**
 * GET /api/tasks/cache-stats (alias: GET /api/tasks/cache/debug)
 * Protected debug endpoint reporting cache hit/miss counters and stats
 * without exposing secrets or task data.
 */
router.get(['/cache-stats', '/cache/debug'], (req, res) => {
  res.json({
    success: true,
    cacheEnabled: cache.isCacheEnabled(req),
    stdTTL: 60,
    stats: cache.getDebugStats(),
  });
});

/**
 * POST /api/tasks/cache-stats/reset (alias: POST /api/tasks/cache/debug/reset)
 * Protected endpoint to reset cache counters before benchmark runs.
 */
router.post(['/cache-stats/reset', '/cache/debug/reset'], (req, res) => {
  cache.resetStats();
  res.json({
    message: 'Cache stats reset successfully',
    stats: cache.getDebugStats(),
  });
});

/**
 * GET /api/tasks
 * List all tasks for the currently authenticated user.
 * Caches database results in node-cache for 60 seconds with user-scoped key.
 */
router.get('/', async (req, res) => {
  try {
    const cacheKey = `tasks:${req.user.id}`;

    // Return cached data if available and caching is enabled
    if (cache.isCacheEnabled(req)) {
      const cachedTasks = cache.get(cacheKey);
      if (cachedTasks !== undefined) {
        cache.recordHit();
        res.setHeader('X-Cache', 'HIT');
        return res.json(cachedTasks);
      }
    }

    cache.recordMiss();
    res.setHeader('X-Cache', 'MISS');

    // Query optimization: lean() skips Mongoose document hydration
    const tasks = await Task.find({ user: req.user.id })
      .sort({ createdAt: -1 })
      .lean();

    // Store in cache with 60-second TTL
    if (cache.isCacheEnabled(req)) {
      cache.set(cacheKey, tasks, 60);
      cache.recordSet();
    }

    res.json(tasks);
  } catch (err) {
    console.error('Get tasks error:', err.message);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

/**
 * GET /api/tasks/:id
 * Get a single task by ID (scoped to the authenticated user).
 * Caches individual task in node-cache with user-and-task-scoped key.
 */
router.get('/:id', async (req, res) => {
  try {
    // Validate ObjectId format to prevent CastError
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid task ID format' });
    }

    const cacheKey = `task:${req.user.id}:${req.params.id}`;

    // Return cached single task if available
    if (cache.isCacheEnabled(req)) {
      const cachedTask = cache.get(cacheKey);
      if (cachedTask !== undefined) {
        cache.recordHit();
        res.setHeader('X-Cache', 'HIT');
        return res.json(cachedTask);
      }
    }

    cache.recordMiss();
    res.setHeader('X-Cache', 'MISS');

    // Query optimization: lean() returns plain JS object
    const task = await Task.findOne({ _id: req.params.id, user: req.user.id }).lean();
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Store single task in cache with 60-second TTL
    if (cache.isCacheEnabled(req)) {
      cache.set(cacheKey, task, 60);
      cache.recordSet();
    }

    res.json(task);
  } catch (err) {
    console.error('Get task error:', err.message);
    res.status(500).json({ error: 'Failed to fetch task' });
  }
});

/**
 * POST /api/tasks
 * Create a new task. Validation middleware checks title before this runs.
 * Invalidates the authenticated user's cached tasks list upon success.
 */
router.post('/', validateTask, async (req, res) => {
  try {
    const { title, description, status, priority } = req.body;

    const task = await Task.create({
      title,
      description,
      status,
      priority,
      user: req.user.id,
    });

    // Invalidate user's all-tasks cache after successful write
    cache.invalidateUserTasks(req.user.id);

    res.status(201).json(task);
    console.log(`[API] Task creation response sent at ${new Date().toISOString()} for task "${task.title}"`);
    taskEvents.emit('task-created', {
      title: task.title,
      taskId: task._id.toString(),
      assignedUserId: req.user.id,
    });

  } catch (err) {
    console.error('Create task error:', err.message);
    if (err.name === 'ValidationError') {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: 'Failed to create task' });
  }
});

/**
 * PUT /api/tasks/:id
 * Update a task. Validation middleware checks input first.
 * Invalidates both all-tasks cache and the specific task cache upon success.
 */
router.put('/:id', validateTask, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid task ID format' });
    }

    const { title, description, status, priority } = req.body;

    const task = await Task.findOneAndUpdate(
      { _id: req.params.id, user: req.user.id },
      { title, description, status, priority },
      { new: true, runValidators: true }
    );

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Invalidate both all-tasks cache and this single task cache after successful update
    cache.invalidateUserTasks(req.user.id, req.params.id);

    res.json(task);
  } catch (err) {
    console.error('Update task error:', err.message);
    if (err.name === 'ValidationError') {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: 'Failed to update task' });
  }
});

/**
 * DELETE /api/tasks/:id
 * Delete a task (scoped to the authenticated user).
 * Invalidates both all-tasks cache and the specific task cache upon success.
 */
router.delete('/:id', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid task ID format' });
    }

    const task = await Task.findOneAndDelete({
      _id: req.params.id,
      user: req.user.id,
    });

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Invalidate both all-tasks cache and this single task cache after successful deletion
    cache.invalidateUserTasks(req.user.id, req.params.id);

    res.json({ message: 'Task deleted successfully' });
    console.log(`[API] Task deletion response sent at ${new Date().toISOString()} for task "${task.title}"`);
    taskEvents.emit('task-deleted', {
      title: task.title,
      taskId: task._id.toString(),
      assignedUserId: req.user.id,
    });
  } catch (err) {
    console.error('Delete task error:', err.message);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

module.exports = router;
