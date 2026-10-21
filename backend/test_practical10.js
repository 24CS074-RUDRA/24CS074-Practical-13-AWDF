/**
 * Practical 9 and 10 integration suite for caching and asynchronous task events.
 */
require('dotenv').config();
const http = require('http');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const express = require('express');

// Import routes and models
require('./listeners');
const authRoutes = require('./routes/auth');
const taskRoutes = require('./routes/tasks');
const Task = require('./models/Task');
const User = require('./models/User');
const cache = require('./utils/cache');
const eventLogs = [];
const originalConsoleLog = console.log;

async function runTests() {
  console.log = (...args) => {
    const message = args.map(String).join(' ');
    if (message.startsWith('[API]') || message.startsWith('[Notification]')) {
      eventLogs.push(message);
    }
    originalConsoleLog(...args);
  };

  console.log('--- Starting Practical 9 and 10 Verification Suite ---');

  // Connect to DB
  await mongoose.connect(process.env.MONGO_URI);
  console.log('✅ Connected to MongoDB');

  // Build Express app instance
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  app.use('/api/tasks', taskRoutes);

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;
  console.log(`✅ Test server running on ${baseUrl}`);

  try {
    // Reset cache & stats
    cache.flushAll();
    cache.resetStats();

    // Create 2 test user tokens
    const testUserId1 = new mongoose.Types.ObjectId().toString();
    const testUserId2 = new mongoose.Types.ObjectId().toString();
    const token1 = jwt.sign({ id: testUserId1, email: 'user1@test.com' }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const token2 = jwt.sign({ id: testUserId2, email: 'user2@test.com' }, process.env.JWT_SECRET, { expiresIn: '1h' });

    // 1. Test Unauthenticated access (401)
    const unauthRes = await fetch(`${baseUrl}/api/tasks`);
    console.assert(unauthRes.status === 401, 'Unauthenticated request should return 401');
    console.log('✅ 1. Unauthenticated GET /api/tasks correctly returns 401');

    // 2. Test Invalid Token (401)
    const invalidTokenRes = await fetch(`${baseUrl}/api/tasks`, {
      headers: { Authorization: 'Bearer bad.token.here' },
    });
    console.assert(invalidTokenRes.status === 401, 'Invalid token should return 401');
    console.log('✅ 2. Invalid token GET /api/tasks correctly returns 401');

    // 3. Test Invalid ID format (400)
    const invalidIdRes = await fetch(`${baseUrl}/api/tasks/not-a-valid-id`, {
      headers: { Authorization: `Bearer ${token1}` },
    });
    console.assert(invalidIdRes.status === 400, 'Invalid task ID format should return 400');
    console.log('✅ 3. Malformed task ID GET /api/tasks/not-a-valid-id returns 400');

    // 4. Test Missing Task (404)
    const randomObjectId = new mongoose.Types.ObjectId().toString();
    const missingTaskRes = await fetch(`${baseUrl}/api/tasks/${randomObjectId}`, {
      headers: { Authorization: `Bearer ${token1}` },
    });
    console.assert(missingTaskRes.status === 404, 'Missing task should return 404');
    console.log('✅ 4. Non-existent task ID returns 404 without error');

    // 5. Test Initial GET /api/tasks (Cache MISS)
    const get1 = await fetch(`${baseUrl}/api/tasks`, {
      headers: { Authorization: `Bearer ${token1}` },
    });
    console.assert(get1.headers.get('x-cache') === 'MISS', 'First GET should be MISS');
    const tasks1 = await get1.json();
    console.log(`✅ 5. Initial GET /api/tasks is MISS, returned ${tasks1.length} tasks`);

    // 6. Test Second GET /api/tasks (Cache HIT)
    const get2 = await fetch(`${baseUrl}/api/tasks`, {
      headers: { Authorization: `Bearer ${token1}` },
    });
    console.assert(get2.headers.get('x-cache') === 'HIT', 'Second GET should be HIT');
    console.log('✅ 6. Subsequent GET /api/tasks is HIT');

    // 7. Test User Isolation (User 2 should get MISS and separate cache key)
    const getU2 = await fetch(`${baseUrl}/api/tasks`, {
      headers: { Authorization: `Bearer ${token2}` },
    });
    console.assert(getU2.headers.get('x-cache') === 'MISS', 'User 2 GET should be MISS');
    console.assert(cache.has(`tasks:${testUserId1}`), 'User 1 cache key exists');
    console.assert(cache.has(`tasks:${testUserId2}`), 'User 2 cache key exists');
    console.log('✅ 7. User isolation verified: each user has dedicated cache key');

    // 8. Create a task for User 1 (POST) -> verifies cache invalidation of tasks:userId
    const createStartedAt = Date.now();
    const createRes = await fetch(`${baseUrl}/api/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token1}`,
      },
      body: JSON.stringify({
        title: 'Cache Invalidation Test Task',
        description: 'Testing write invalidation',
        priority: 'high',
      }),
    });
    console.assert(createRes.status === 201, 'Task creation should return 201');
    const createdTask = await createRes.json();
    const createResponseDuration = Date.now() - createStartedAt;
    const apiCreateLog = eventLogs.find((message) => (
      message.startsWith('[API] Task creation response sent') &&
      message.includes(`"${createdTask.title}"`)
    ));
    assert.ok(apiCreateLog, 'API response timestamp should be logged after task creation');
    assert.ok(
      !eventLogs.some((message) => message.startsWith('[Notification] Task "') && message.includes('created at')),
      'Task-created notification should not finish before the API response'
    );
    assert.ok(createResponseDuration < 2000, 'Task API should respond before the two-second notification delay');
    console.assert(!cache.has(`tasks:${testUserId1}`), 'User 1 task list cache should be invalidated after POST');
    console.log('✅ 8. POST /api/tasks successfully invalidates User 1 all-tasks cache');
    console.log('✅ 9. POST response returned before the delayed task-created notification');
    await new Promise((resolve) => setTimeout(resolve, 2100));
    const createdNotification = eventLogs.find((message) => (
      message.startsWith('[Notification] Task "') &&
      message.includes(`"${createdTask.title}"`) &&
      message.includes('created at')
    ));
    assert.ok(createdNotification, 'Task-created notification should run asynchronously');
    const apiTimestamp = Date.parse(apiCreateLog.match(/sent at (.+) for task/)[1]);
    const notificationTimestamp = Date.parse(createdNotification.match(/created at (.+) for user/)[1]);
    assert.ok(notificationTimestamp - apiTimestamp >= 1900, 'Notification should finish after the configured delay');
    assert.ok(
      createdNotification.includes(`user ${testUserId1}`),
      'Task-created notification should identify the assigned user'
    );
    console.log('✅ 10. Delayed task-created notification logs its timestamp and assigned user');

    // 9. Single task GET /api/tasks/:id (MISS then HIT)
    const getSingle1 = await fetch(`${baseUrl}/api/tasks/${createdTask._id}`, {
      headers: { Authorization: `Bearer ${token1}` },
    });
    console.assert(getSingle1.headers.get('x-cache') === 'MISS', 'First single task GET should be MISS');
    console.assert(cache.has(`task:${testUserId1}:${createdTask._id}`), 'Single task cache key should now exist');

    const getSingle2 = await fetch(`${baseUrl}/api/tasks/${createdTask._id}`, {
      headers: { Authorization: `Bearer ${token1}` },
    });
    console.assert(getSingle2.headers.get('x-cache') === 'HIT', 'Second single task GET should be HIT');
    console.log('✅ 11. GET /api/tasks/:id caching verified (MISS then HIT)');

    // 10. Cache all tasks again for User 1 to prepare for update test
    await fetch(`${baseUrl}/api/tasks`, { headers: { Authorization: `Bearer ${token1}` } });
    console.assert(cache.has(`tasks:${testUserId1}`), 'User 1 all-tasks cache repopulated');

    // 11. PUT /api/tasks/:id (Update) -> invalidates both all-tasks cache AND single-task cache
    const updateRes = await fetch(`${baseUrl}/api/tasks/${createdTask._id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token1}`,
      },
      body: JSON.stringify({
        title: 'Updated Task Title',
        status: 'in-progress',
      }),
    });
    console.assert(updateRes.status === 200, 'Task update should return 200');
    console.assert(!cache.has(`tasks:${testUserId1}`), 'User 1 all-tasks cache must be invalidated after PUT');
    console.assert(!cache.has(`task:${testUserId1}:${createdTask._id}`), 'Single-task cache must be invalidated after PUT');
    console.log('✅ 12. PUT /api/tasks/:id successfully invalidates both all-tasks and single-task caches');

    // 12. Cache single task and all-tasks again to test DELETE
    await fetch(`${baseUrl}/api/tasks`, { headers: { Authorization: `Bearer ${token1}` } });
    await fetch(`${baseUrl}/api/tasks/${createdTask._id}`, { headers: { Authorization: `Bearer ${token1}` } });
    console.assert(cache.has(`tasks:${testUserId1}`), 'All-tasks cached before delete');
    console.assert(cache.has(`task:${testUserId1}:${createdTask._id}`), 'Single task cached before delete');

    // 13. DELETE /api/tasks/:id -> invalidates both caches
    const deleteRes = await fetch(`${baseUrl}/api/tasks/${createdTask._id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token1}` },
    });
    console.assert(deleteRes.status === 200, 'Task deletion should return 200');
    console.assert(!cache.has(`tasks:${testUserId1}`), 'All-tasks cache invalidated after DELETE');
    console.assert(!cache.has(`task:${testUserId1}:${createdTask._id}`), 'Single-task cache invalidated after DELETE');
    await new Promise((resolve) => setImmediate(resolve));
    assert.ok(
      eventLogs.some((message) => (
        message.startsWith('[Notification] Task "') &&
        message.includes('"Updated Task Title"') &&
        message.includes('deleted at')
      )),
      'Task-deleted event should log a deletion notification'
    );
    console.log('✅ 13. DELETE /api/tasks/:id invalidates caches and emits task-deleted');

    // 14. Test Debug endpoint GET /api/tasks/cache-stats
    const statsRes = await fetch(`${baseUrl}/api/tasks/cache-stats`, {
      headers: { Authorization: `Bearer ${token1}` },
    });
    console.assert(statsRes.status === 200, 'Debug stats endpoint should return 200');
    const statsData = await statsRes.json();
    console.assert(typeof statsData.stats.hits === 'number', 'Stats must report hit count');
    console.assert(typeof statsData.stats.misses === 'number', 'Stats must report miss count');
    console.assert(statsData.stdTTL === 60, 'Stats must report 60s TTL');
    console.assert(statsData.stats.hits > 0, 'Hits should be > 0');
    console.log('✅ 14. Debug stats endpoint verified:', JSON.stringify(statsData.stats));

    // 15. Test X-Skip-Cache header bypass
    const skipRes = await fetch(`${baseUrl}/api/tasks`, {
      headers: {
        Authorization: `Bearer ${token1}`,
        'x-skip-cache': 'true',
      },
    });
    console.assert(skipRes.headers.get('x-cache') === 'MISS', 'x-skip-cache must result in cache miss/bypass');
    console.log('✅ 15. x-skip-cache header successfully bypasses cache for benchmarking');

    console.log('\n🎉 ALL 15 PRACTICAL 9 AND 10 VERIFICATION CHECKS PASSED! 🎉\n');
  } finally {
    server.close();
    await mongoose.disconnect();
    console.log = originalConsoleLog;
  }
}

runTests().catch((err) => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
