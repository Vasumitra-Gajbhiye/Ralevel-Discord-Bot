# @ralevel/web

Next.js control dashboard for the r/alevel Discord bot.

## Features

- **Settings** — roles, command permission matrix, channels, feature flags, reputation, XP ranks, schedules, welcome, certificates, confessions, tasks, polls/sticky/helper, access control
- **Operations** — warnings, notes, mod logs, certificates queue, tasks, stickies, confessions, reputation, helpers, QOTD, users, polls

Settings are stored in MongoDB `GuildConfig`. The bot loads them at startup — **restart the bot** after changing settings. Operational edits apply immediately.

## Auth

Sign-in is handled by [Clerk](https://clerk.com). Only allowlisted emails can sign up (Clerk **Restricted** mode). Manage the allowlist under **Settings → Access**.

Required env vars (repo-root `.env`): `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, and the Clerk URL redirects — see `docs/environment-variables.md`.

## Dev

From repo root (with root `.env` containing `MONGO_URI`, `GUILD_ID`, and Clerk keys):

```bash
pnpm dev:web
```

Seed GuildConfig from env if needed:

```bash
pnpm --filter @ralevel/bot seed:guild-config
```
