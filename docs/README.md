# r/alevel Discord Bot — Documentation

Complete developer documentation for the r/alevel Discord bot.

## Quick start

1. [Setup](setup.md) — clone, install, configure, and run locally
2. [Environment Variables](environment-variables.md) — every `.env` variable explained
3. [Architecture](architecture.md) — project structure and startup flow

## Reference

| Document | Description |
|----------|-------------|
| [Setup](setup.md) | Local development setup and first run |
| [Environment Variables](environment-variables.md) | All configuration variables |
| [Architecture](architecture.md) | Project structure, startup flow, design decisions |
| [Commands](commands.md) | All 72 slash commands with permissions |
| [Systems](systems.md) | Background systems, event listeners, schedulers |
| [Adding Commands](adding-commands.md) | How to create and deploy new slash commands |
| [Deployment](deployment.md) | Docker and Coolify production deployment |
| [Database](database.md) | MongoDB collections and Redis keys |
| [Troubleshooting](troubleshooting.md) | Common problems and fixes |

## What this bot does

The r/alevel bot is a **monolithic Node.js Discord bot** for the r/alevel server. It provides slash commands for moderation, reputation, tasks, certificates, confessions, polls, and more; message tracking with daily XP finalization (Redis → MongoDB); automatic reputation from thank-you messages; sticky messages, welcome cards, QOTD reminders, and poll management.

**Tech stack:** discord.js v14, Mongoose (MongoDB), ioredis (Redis), @napi-rs/canvas.

**Entry point:** `index.js` at the repository root.
