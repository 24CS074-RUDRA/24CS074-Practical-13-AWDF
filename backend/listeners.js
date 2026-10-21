const taskEvents = require('./events');

const notificationDelayMs = 2000;

taskEvents.on('task-created', (task) => {
  setTimeout(() => {
    try {
      console.log(
        `[Notification] Task "${task.title}" created at ${new Date().toISOString()} for user ${task.assignedUserId}`
      );
    } catch (error) {
      taskEvents.emit('error', error, 'task-created');
    }
  }, notificationDelayMs);
});

taskEvents.on('task-deleted', (task) => {
  setImmediate(() => {
    try {
      console.log(
        `[Notification] Task "${task.title}" deleted at ${new Date().toISOString()} for user ${task.assignedUserId}`
      );
    } catch (error) {
      taskEvents.emit('error', error, 'task-deleted');
    }
  });
});

taskEvents.on('error', (error, eventName) => {
  console.error(`[Notification Error] ${eventName}:`, error);
});
