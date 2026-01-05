/**
 * GroupNotifier - Posts token launch data to a public Telegram group with topics
 * 
 * Configuration (via .env):
 *   TELEGRAM_GROUP_ID=-1003635509677
 *   TELEGRAM_TOPIC_LAUNCHES=659
 *   GROUP_NOTIFICATIONS_ENABLED=true
 */

const TelegramBot = require('node-telegram-bot-api');

class GroupNotifier {
  constructor() {
    this.bot = null;
    this.enabled = false;
    this.groupId = null;
    this.topicLaunches = null;
  }

  /**
   * Initialize the group notifier
   * @param {TelegramBot} botInstance - The existing bot instance to reuse
   */
  init(botInstance) {
    this.bot = botInstance;
    
    // Load configuration from environment
    this.groupId = process.env.TELEGRAM_GROUP_ID ? parseInt(process.env.TELEGRAM_GROUP_ID) : null;
    this.topicLaunches = process.env.TELEGRAM_TOPIC_LAUNCHES ? parseInt(process.env.TELEGRAM_TOPIC_LAUNCHES) : null;
    this.enabled = process.env.GROUP_NOTIFICATIONS_ENABLED === 'true' && this.groupId && this.topicLaunches;

    if (this.enabled) {
      console.log(`[GROUP NOTIFIER] ✅ Enabled - Group: ${this.groupId}, Topic: ${this.topicLaunches}`);
    } else {
      console.log('[GROUP NOTIFIER] ⚠️ Disabled - Missing TELEGRAM_GROUP_ID, TELEGRAM_TOPIC_LAUNCHES, or GROUP_NOTIFICATIONS_ENABLED');
    }
  }

  /**
   * Check if notifications are enabled
   */
  isEnabled() {
    return this.enabled && this.bot !== null;
  }

  /**
   * Format SOL amount with proper escaping for MarkdownV2
   */
  formatSol(amount) {
    if (amount === null || amount === undefined) return '0';
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return num.toFixed(4).replace(/\./g, '\\.');
  }

  /**
   * Escape special characters for MarkdownV2
   */
  escapeMarkdown(text) {
    if (!text) return '';
    return String(text).replace(/[_*\[\]()~`>#+=|{}.!-]/g, '\\$&');
  }

  /**
   * Post a token launch notification to the group
   * @param {Object} launchData - Launch details
   */
  async postTokenLaunch(launchData) {
    if (!this.isEnabled()) {
      console.log('[GROUP NOTIFIER] Skipping - notifications disabled');
      return { success: false, reason: 'disabled' };
    }

    try {
      const {
        tokenName,
        tokenSymbol,
        mintAddress,
        platform = 'pumpfun',
        initialBuy = 0,
        bundleWalletCount = 0,
        signature,
        bundleId,
        username,
        metadataUri,
        description,
        twitter,
        telegram,
        website
      } = launchData;

      // Build the message
      const lines = [
        '🚀 *NEW TOKEN LAUNCH*',
        '',
        `🪙 *${this.escapeMarkdown(tokenName)}* \\(${this.escapeMarkdown(tokenSymbol)}\\)`,
        '',
        `📍 Platform: ${platform === 'pumpfun' ? 'Pump\\.fun' : this.escapeMarkdown(platform)}`,
        `💰 Initial Buy: ${this.formatSol(initialBuy)} SOL`,
      ];

      if (bundleWalletCount > 0) {
        lines.push(`👛 Bundle Wallets: ${bundleWalletCount}`);
      }

      lines.push('');
      lines.push(`🔑 *Mint Address:*`);
      lines.push(`\`${mintAddress}\``);

      // Add social links if available
      const socials = [];
      if (twitter) socials.push(`[Twitter](${twitter})`);
      if (telegram) socials.push(`[Telegram](${telegram})`);
      if (website) socials.push(`[Website](${website})`);
      
      if (socials.length > 0) {
        lines.push('');
        lines.push(`🔗 ${socials.join(' \\| ')}`);
      }

      // Add description snippet if available
      if (description && description.length > 0) {
        const shortDesc = description.length > 100 
          ? description.substring(0, 100) + '...' 
          : description;
        lines.push('');
        lines.push(`📝 _${this.escapeMarkdown(shortDesc)}_`);
      }

      lines.push('');
      lines.push('━━━━━━━━━━━━━━━━━━━━━━');
      lines.push('_Launched via PARASOL_ ☂️');

      const message = lines.join('\n');

      // Build inline keyboard with links
      const keyboard = [];
      
      // Row 1: Main links
      const row1 = [];
      if (platform === 'pumpfun') {
        row1.push({ text: '🎪 Pump.fun', url: `https://pump.fun/${mintAddress}` });
      }
      row1.push({ text: '🔍 Solscan', url: `https://solscan.io/token/${mintAddress}` });
      if (row1.length > 0) keyboard.push(row1);

      // Row 2: DEX links
      keyboard.push([
        { text: '📊 DexScreener', url: `https://dexscreener.com/solana/${mintAddress}` },
        { text: '🦅 Birdeye', url: `https://birdeye.so/token/${mintAddress}?chain=solana` }
      ]);

      // Row 3: Transaction link
      if (signature) {
        keyboard.push([
          { text: '📜 View Transaction', url: `https://solscan.io/tx/${signature}` }
        ]);
      }

      // Send to group topic
      const result = await this.bot.sendMessage(this.groupId, message, {
        parse_mode: 'MarkdownV2',
        message_thread_id: this.topicLaunches,
        reply_markup: { inline_keyboard: keyboard },
        disable_web_page_preview: true
      });

      console.log(`[GROUP NOTIFIER] ✅ Posted launch: ${tokenSymbol} (${mintAddress.slice(0, 8)}...)`);
      
      return { 
        success: true, 
        messageId: result.message_id,
        chatId: this.groupId,
        topicId: this.topicLaunches
      };

    } catch (error) {
      console.error(`[GROUP NOTIFIER] ❌ Failed to post launch:`, error.message);
      
      // Don't throw - we don't want to break the main flow
      return { 
        success: false, 
        reason: error.message 
      };
    }
  }

  /**
   * Post a migration/graduation notification (when token moves from pump.fun to Raydium)
   * @param {Object} migrationData - Migration details
   */
  async postMigration(migrationData) {
    if (!this.isEnabled()) {
      return { success: false, reason: 'disabled' };
    }

    try {
      const {
        tokenName,
        tokenSymbol,
        mintAddress,
        poolAddress,
        liquidityAmount,
        signature
      } = migrationData;

      const message = [
        '🎓 *TOKEN GRADUATED*',
        '',
        `🪙 *${this.escapeMarkdown(tokenName)}* \\(${this.escapeMarkdown(tokenSymbol)}\\)`,
        '',
        `✅ Successfully migrated to Raydium\\!`,
        `💧 Liquidity: ${this.formatSol(liquidityAmount)} SOL`,
        '',
        `🔑 Mint: \`${mintAddress}\``,
        '',
        '━━━━━━━━━━━━━━━━━━━━━━',
        '_Powered by PARASOL_ ☂️'
      ].join('\n');

      const keyboard = [
        [
          { text: '📊 DexScreener', url: `https://dexscreener.com/solana/${mintAddress}` },
          { text: '🔍 Solscan', url: `https://solscan.io/token/${mintAddress}` }
        ]
      ];

      if (poolAddress) {
        keyboard.push([
          { text: '💧 Raydium Pool', url: `https://raydium.io/swap/?inputMint=sol&outputMint=${mintAddress}` }
        ]);
      }

      const result = await this.bot.sendMessage(this.groupId, message, {
        parse_mode: 'MarkdownV2',
        message_thread_id: this.topicLaunches,
        reply_markup: { inline_keyboard: keyboard },
        disable_web_page_preview: true
      });

      console.log(`[GROUP NOTIFIER] ✅ Posted migration: ${tokenSymbol}`);
      
      return { success: true, messageId: result.message_id };

    } catch (error) {
      console.error(`[GROUP NOTIFIER] ❌ Failed to post migration:`, error.message);
      return { success: false, reason: error.message };
    }
  }

  /**
   * Send a test ping to verify configuration works
   */
  async sendTestPing() {
    if (!this.bot) {
      return { success: false, reason: 'Bot not initialized' };
    }

    if (!this.groupId || !this.topicLaunches) {
      return { 
        success: false, 
        reason: `Missing config: groupId=${this.groupId}, topicId=${this.topicLaunches}` 
      };
    }

    try {
      const message = [
        '🔔 *PARASOL Connection Test*',
        '',
        '✅ Group notifications are working\\!',
        '',
        `📍 Group ID: \`${this.groupId}\``,
        `📌 Topic ID: \`${this.topicLaunches}\``,
        '',
        '_Successful token launches from PARASOL will be posted here automatically\\._',
        '',
        '━━━━━━━━━━━━━━━━━━━━━━',
        `_Test sent at ${new Date().toISOString().replace(/[-:.]/g, '\\$&')}_`
      ].join('\n');

      const result = await this.bot.sendMessage(this.groupId, message, {
        parse_mode: 'MarkdownV2',
        message_thread_id: this.topicLaunches
      });

      console.log(`[GROUP NOTIFIER] ✅ Test ping successful - Message ID: ${result.message_id}`);
      
      return { 
        success: true, 
        messageId: result.message_id,
        groupId: this.groupId,
        topicId: this.topicLaunches
      };

    } catch (error) {
      console.error(`[GROUP NOTIFIER] ❌ Test ping failed:`, error.message);
      return { success: false, reason: error.message };
    }
  }
}

// Singleton instance
const groupNotifier = new GroupNotifier();

module.exports = { groupNotifier, GroupNotifier };

