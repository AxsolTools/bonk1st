// Entry point: Telegram bot + DexScreenerTracker wiring (Solana-only)
import 'dotenv/config';
import TelegramBot from 'node-telegram-bot-api';
import DexScreenerTracker from './DexScreenerTracker (1).js';
import fs from 'fs';
import path from 'path';

// Load env
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error('TELEGRAM_BOT_TOKEN is missing in environment');
  process.exit(1);
}

// Optional: preconfigured chats file
const chatsFile = path.resolve('./chats.json');
function loadChats() {
  try {
    if (fs.existsSync(chatsFile)) {
      const data = JSON.parse(fs.readFileSync(chatsFile, 'utf8'));
      if (Array.isArray(data)) return new Set(data);
    }
  } catch (e) {
    console.error('Failed to read chats.json:', e);
  }
  return new Set();
}

function saveChats(set) {
  try {
    fs.writeFileSync(chatsFile, JSON.stringify(Array.from(set), null, 2));
  } catch (e) {
    console.error('Failed to write chats.json:', e);
  }
}

// Create bot
const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const tracker = new DexScreenerTracker(bot);

// Restore chats
const initialChats = loadChats();
initialChats.forEach((id) => tracker.addChat(id));

// Simple commands to manage chats
bot.onText(/\/start(.*)?/, async (msg) => {
  const chatId = msg.chat.id;
  await tracker.addChat(chatId);
  initialChats.add(chatId);
  saveChats(initialChats);
  bot.sendMessage(chatId, '✅ Subscribed to Solana DexScreener updates.');
});

bot.onText(/\/stop(.*)?/, async (msg) => {
  const chatId = msg.chat.id;
  tracker.removeChat(chatId);
  initialChats.delete(chatId);
  saveChats(initialChats);
  bot.sendMessage(chatId, '🛑 Unsubscribed from Solana updates.');
});

// Health check
bot.onText(/\/health(.*)?/, (msg) => {
  bot.sendMessage(msg.chat.id, '✅ Bot is running. Tracking: Solana only.');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Stopping bot...');
  tracker.stop();
  bot.stopPolling().finally(() => process.exit(0));
});