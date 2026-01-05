/**
 * Rate Limiting Module
 * Prevents abuse by limiting user actions
 */

// In-memory rate limit store (use Redis in production)
const rateLimitStore = new Map();

// Rate limit configurations
const RATE_LIMITS = {
  // Command-specific limits
  create_wallet: { max: 5, window: 3600000 }, // 5 per hour
  create_token: { max: 10, window: 3600000 }, // 10 per hour
  create_pool: { max: 10, window: 3600000 }, // 10 per hour
  balance: { max: 60, window: 60000 }, // 60 per minute
  
  // Global limit per user
  global: { max: 100, window: 60000 } // 100 requests per minute
};

/**
 * Check if user is rate limited
 * @param {number} userId - User ID
 * @param {string} action - Action type
 * @returns {object} { allowed: boolean, retryAfter: number }
 */
function checkRateLimit(userId, action = 'global') {
  const key = `${userId}:${action}`;
  const limit = RATE_LIMITS[action] || RATE_LIMITS.global;
  
  const now = Date.now();
  
  // Get or create user's action history
  if (!rateLimitStore.has(key)) {
    rateLimitStore.set(key, []);
  }
  
  const history = rateLimitStore.get(key);
  
  // Remove old entries outside the time window
  const validHistory = history.filter(timestamp => now - timestamp < limit.window);
  
  // Check if limit exceeded
  if (validHistory.length >= limit.max) {
    const oldestEntry = Math.min(...validHistory);
    const retryAfter = limit.window - (now - oldestEntry);
    
    return {
      allowed: false,
      retryAfter: Math.ceil(retryAfter / 1000), // Convert to seconds
      limit: limit.max,
      window: limit.window / 1000 // Convert to seconds
    };
  }
  
  // Add current timestamp
  validHistory.push(now);
  rateLimitStore.set(key, validHistory);
  
  return {
    allowed: true,
    remaining: limit.max - validHistory.length,
    resetAt: now + limit.window
  };
}

/**
 * Rate limit middleware for commands
 * @param {number} userId - User ID
 * @param {string} action - Action type
 * @returns {Promise<void>} Throws if rate limited
 */
async function enforceRateLimit(userId, action) {
  const result = checkRateLimit(userId, action);
  
  if (!result.allowed) {
    throw new Error(
      `Rate limit exceeded. Please wait ${result.retryAfter} seconds before trying again.`
    );
  }
}

/**
 * Reset rate limit for a user (admin function)
 * @param {number} userId - User ID
 * @param {string} action - Action type (optional, resets all if not provided)
 */
function resetRateLimit(userId, action = null) {
  if (action) {
    const key = `${userId}:${action}`;
    rateLimitStore.delete(key);
  } else {
    // Reset all actions for user
    const keysToDelete = [];
    for (const key of rateLimitStore.keys()) {
      if (key.startsWith(`${userId}:`)) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach(key => rateLimitStore.delete(key));
  }
}

/**
 * Get rate limit status for user
 * @param {number} userId - User ID
 * @returns {object} Rate limit status
 */
function getRateLimitStatus(userId) {
  const status = {};
  
  for (const [action, limit] of Object.entries(RATE_LIMITS)) {
    const key = `${userId}:${action}`;
    const history = rateLimitStore.get(key) || [];
    const now = Date.now();
    const validHistory = history.filter(timestamp => now - timestamp < limit.window);
    
    status[action] = {
      used: validHistory.length,
      limit: limit.max,
      remaining: limit.max - validHistory.length,
      resetsIn: validHistory.length > 0 
        ? Math.ceil((limit.window - (now - Math.min(...validHistory))) / 1000)
        : 0
    };
  }
  
  return status;
}

module.exports = {
  checkRateLimit,
  enforceRateLimit,
  resetRateLimit,
  getRateLimitStatus,
  RATE_LIMITS
};

