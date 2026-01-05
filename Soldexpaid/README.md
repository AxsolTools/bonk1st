# Solana DexScreener Telegram Bot (Production)

Tracks DexScreener Solana boosts/profiles and broadcasts to subscribed chats.

## Features
- Solana-only updates (other chains ignored)
- Distinctive notifications for visibility
- Persistent chat subscriptions via `chats.json`
- Run with Node, PM2, or Docker

## Setup
1. Copy `.env.sample` to `.env` and set:
```
TELEGRAM_BOT_TOKEN=your_token_here
```
2. Install deps:
```
npm install
```
3. Start locally:
```
npm start
```

## Subscribe/Unsubscribe in Telegram
- Send `/start` to the bot: subscribes current chat and persists to `chats.json`.
- Send `/stop` to unsubscribe.
- `/health` to check status.

## PM2 (production)
```
npm install -g pm2
npm run pm2
pm2 save
pm2 status
```

## Docker
```
docker compose up -d --build
```

## Files
- `index.js` — bootstraps Telegram bot and tracker
- `DexScreenerTracker (1).js` — tracker logic (Solana only)
- `chats.json` — persisted chat ids (auto-created)
- `ecosystem.config.cjs` — PM2 config
- `Dockerfile`, `docker-compose.yml` — containerized run

## Notes
- Requires Node 18+.
- Make sure your bot has started and you send `/start` from each chat to receive updates.