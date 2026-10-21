const NodeCache = require('node-cache');

/**
 * Shared In-Memory Cache Instance
 * Configured with standard TTL of 60 seconds and automatic eviction check.
 */
const cache = new NodeCache({
  stdTTL: 60,       // Default Time-To-Live in seconds
  checkperiod: 120, // Automatic cleanup check interval
});

/**
 * In-memory telemetry counters for cache hit/miss monitoring and benchmarking
 */
const counters = {
  hits: 0,
  misses: 0,
  sets: 0,
  invalidations: 0,
};

// Expose counters reference on cache instance
cache.counters = counters;

/**
 * Check whether caching is globally or request-level enabled.
 * - Set CACHE_ENABLED=false in .env to disable globally for benchmarking
 * - Send header "x-skip-cache: true" in Thunder Client for uncached requests
 */
cache.isCacheEnabled = (req) => {
  if (process.env.CACHE_ENABLED === 'false') {
    return false;
  }
  if (req && req.headers && req.headers['x-skip-cache'] === 'true') {
    return false;
  }
  return true;
};

/**
 * Record a cache hit
 */
cache.recordHit = () => {
  counters.hits += 1;
};

/**
 * Record a cache miss
 */
cache.recordMiss = () => {
  counters.misses += 1;
};

/**
 * Record a cache set
 */
cache.recordSet = () => {
  counters.sets += 1;
};

/**
 * Invalidate user-scoped task caches.
 * Clears the user's all-tasks cache (`tasks:${userId}`) and, if provided,
 * the specific task cache (`task:${userId}:${taskId}`).
 *
 * @param {string} userId - Authenticated user ID
 * @param {string} [taskId] - Specific task ID (optional)
 * @returns {number} Number of deleted cache keys
 */
cache.invalidateUserTasks = (userId, taskId = null) => {
  const keysToDelete = [`tasks:${userId}`];
  if (taskId) {
    keysToDelete.push(`task:${userId}:${taskId}`);
  }
  const deletedCount = cache.del(keysToDelete);
  counters.invalidations += deletedCount;
  return deletedCount;
};

/**
 * Retrieve debug statistics without leaking sensitive data or task content.
 */
cache.getDebugStats = () => {
  const nodeCacheStats = cache.getStats();
  return {
    hits: counters.hits,
    misses: counters.misses,
    sets: counters.sets,
    invalidations: counters.invalidations,
    cachedKeysCount: cache.keys().length,
    stdTTL: 60,
    nodeCacheStats: {
      hits: nodeCacheStats.hits,
      misses: nodeCacheStats.misses,
      keys: nodeCacheStats.keys,
      ksize: nodeCacheStats.ksize,
      vsize: nodeCacheStats.vsize,
    },
  };
};

/**
 * Reset counters and flush cache stats (useful before benchmark runs).
 */
cache.resetStats = () => {
  counters.hits = 0;
  counters.misses = 0;
  counters.sets = 0;
  counters.invalidations = 0;
  cache.flushStats();
};

module.exports = cache;
