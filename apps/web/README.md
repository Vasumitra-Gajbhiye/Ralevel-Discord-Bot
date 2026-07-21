# @ralevel/web

Next.js control dashboard for the r/alevel Discord bot.

## Features

- **Settings** — roles, command permission matrix, channels, feature flags, reputation, XP ranks, schedules, welcome, certificates, confessions, tasks, polls/sticky/helper
- **Operations** — warnings, notes, mod logs, certificates queue, tasks, stickies, confessions, reputation, helpers, QOTD, users, polls

Settings are stored in MongoDB `GuildConfig`. The bot loads them at startup — **restart the bot** after changing settings. Operational edits apply immediately.

Auth is not enabled yet (Clerk planned later). Keep this app private.

## Dev

From repo root (with root `.env` containing `MONGO_URI` and `GUILD_ID`):

```bash
pnpm dev:web
```

Seed GuildConfig from env if needed:

```bash
pnpm --filter @ralevel/bot seed:guild-config
```
