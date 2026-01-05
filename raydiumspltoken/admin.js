/**
 * Admin Module
 * Handles admin authentication and privileged operations
 */

const db = require('./db');
const { resetRateLimit, getRateLimitStatus } = require('./rate_limiter');

// Admin user IDs from environment
const ADMIN_USER_IDS = process.env.BOT_ADMIN_USER_IDS 
  ? process.env.BOT_ADMIN_USER_IDS.split(',').map(id => parseInt(id.trim()))
  : [];

/**
 * Check if user is admin
 * @param {number} telegramId - Telegram user ID
 * @returns {boolean} True if admin
 */
function isAdmin(telegramId) {
  return ADMIN_USER_IDS.includes(telegramId);
}

/**
 * Require admin authentication
 * @param {number} telegramId - Telegram user ID
 * @throws {Error} If not admin
 */
function requireAdmin(telegramId) {
  if (!isAdmin(telegramId)) {
    throw new Error('⛔ Access denied. This command requires admin privileges.');
  }
}

/**
 * Get system statistics (admin only)
 * @param {number} telegramId - Telegram user ID
 * @returns {object} System stats
 */
function getSystemStats(telegramId) {
  requireAdmin(telegramId);
  
  const stats = {
    users: db.db.prepare('SELECT COUNT(*) as count FROM users').get().count,
    wallets: db.db.prepare('SELECT COUNT(*) as count FROM wallets').get().count,
    tokens: db.db.prepare('SELECT COUNT(*) as count FROM tokens').get().count,
    pools: db.db.prepare('SELECT COUNT(*) as count FROM pools').get().count,
    transactions: db.db.prepare('SELECT COUNT(*) as count FROM transactions').get().count,
    activeUsers: db.db.prepare(
      'SELECT COUNT(DISTINCT user_id) as count FROM transactions WHERE created_at > ?'
    ).get(Math.floor(Date.now() / 1000) - 86400).count // Last 24 hours
  };
  
  return stats;
}

/**
 * Get user details (admin only)
 * @param {number} telegramId - Admin Telegram ID
 * @param {number} targetUserId - Target user ID to query
 * @returns {object} User details
 */
function getUserDetails(telegramId, targetUserId) {
  requireAdmin(telegramId);
  
  const user = db.getUserByTelegramId(targetUserId);
  if (!user) {
    throw new Error('User not found');
  }
  
  const wallets = db.getUserWallets(user.user_id);
  const tokens = db.getUserTokens(user.user_id);
  const transactions = db.getUserTransactions(user.user_id, 10);
  const rateLimits = getRateLimitStatus(user.user_id);
  
  return {
    user,
    wallets: wallets.length,
    tokens: tokens.length,
    recentTransactions: transactions.length,
    rateLimits
  };
}

/**
 * Reset user rate limits (admin only)
 * @param {number} telegramId - Admin Telegram ID
 * @param {number} targetUserId - Target user ID
 */
function adminResetRateLimit(telegramId, targetUserId) {
  requireAdmin(telegramId);
  
  const user = db.getUserByTelegramId(targetUserId);
  if (!user) {
    throw new Error('User not found');
  }
  
  resetRateLimit(user.user_id);
  return { success: true, message: 'Rate limits reset successfully' };
}

/**
 * Get recent transactions (admin only)
 * @param {number} telegramId - Admin Telegram ID
 * @param {number} limit - Number of transactions
 * @returns {Array} Recent transactions
 */
function getRecentTransactions(telegramId, limit = 20) {
  requireAdmin(telegramId);
  
  return db.db.prepare(`
    SELECT t.*, u.telegram_username 
    FROM transactions t
    JOIN users u ON t.user_id = u.user_id
    ORDER BY t.created_at DESC
    LIMIT ?
  `).all(limit);
}

/**
 * Get error logs (admin only)
 * @param {number} telegramId - Admin Telegram ID
 * @param {number} limit - Number of errors
 * @returns {Array} Recent errors
 */
function getErrorLogs(telegramId, limit = 20) {
  requireAdmin(telegramId);
  
  return db.db.prepare(`
    SELECT *
    FROM transactions
    WHERE status = 'failed'
    ORDER BY created_at DESC
    LIMIT ?
  `).all(limit);
}

/**
 * Broadcast message to all users (admin only)
 * @param {number} telegramId - Admin Telegram ID
 * @param {string} message - Message to broadcast
 * @param {object} bot - Telegram bot instance
 * @returns {Promise<object>} Broadcast result
 */
async function broadcastMessage(telegramId, message, bot) {
  requireAdmin(telegramId);
  
  const users = db.db.prepare('SELECT telegram_id FROM users').all();
  
  let sent = 0;
  let failed = 0;
  
  for (const user of users) {
    try {
      await bot.sendMessage(user.telegram_id, message);
      sent++;
    } catch (e) {
      failed++;
    }
  }
  
  return {
    total: users.length,
    sent,
    failed
  };
}

/**
 * Create audit log entry
 * @param {object} params - Log parameters
 */
function createAuditLog(params) {
  const {
    userId,
    action,
    details,
    ipAddress = null
  } = params;
  
  try {
    const hasSqlite =
      db.db &&
      typeof db.db.exec === 'function' &&
      typeof db.db.prepare === 'function';

    if (hasSqlite) {
      db.db.exec(`
        CREATE TABLE IF NOT EXISTS audit_logs (
          log_id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          action TEXT NOT NULL,
          details TEXT,
          ip_address TEXT,
          created_at INTEGER DEFAULT (strftime('%s', 'now')),
          FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
        )
      `);

      db.db
        .prepare(
          'INSERT INTO audit_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)'
        )
        .run(userId, action, JSON.stringify(details ?? null), ipAddress);
      return;
    }

    if (typeof db.appendAuditLog === 'function') {
      db.appendAuditLog({
        userId,
        action,
        details: details ?? null,
        ipAddress
      });
      return;
    }

    console.warn('[AUDIT] Audit logging unavailable in current DB mode.');
  } catch (error) {
    console.error('Error creating audit log:', error);
  }
}

/**
 * Get audit logs (admin only)
 * @param {number} telegramId - Admin Telegram ID
 * @param {number} limit - Number of logs
 * @returns {Array} Audit logs
 */
function getAuditLogs(telegramId, limit = 50) {
  requireAdmin(telegramId);
  
  try {
    const hasSqlite =
      db.db &&
      typeof db.db.prepare === 'function';

    if (hasSqlite) {
      return db.db.prepare(`
        SELECT a.*, u.telegram_username
        FROM audit_logs a
        JOIN users u ON a.user_id = u.user_id
        ORDER BY a.created_at DESC
        LIMIT ?
      `).all(limit);
    }

    if (typeof db.getAuditLogEntries === 'function') {
      const entries = db.getAuditLogEntries(limit);
      return entries.map((entry) => {
        const user = typeof db.getUserById === 'function'
          ? db.getUserById(entry.user_id)
          : null;
        return {
          log_id: entry.log_id,
          user_id: entry.user_id,
          action: entry.action,
          details: entry.details,
          ip_address: entry.ip_address,
          created_at: entry.created_at,
          telegram_username: user ? user.telegram_username : null
        };
      });
    }

    return [];
  } catch (error) {
    return [];
  }
}

module.exports = {
  isAdmin,
  requireAdmin,
  getSystemStats,
  getUserDetails,
  adminResetRateLimit,
  getRecentTransactions,
  getErrorLogs,
  broadcastMessage,
  createAuditLog,
  getAuditLogs,
  ADMIN_USER_IDS
};

