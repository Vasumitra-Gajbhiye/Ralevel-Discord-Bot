# Deployment

This guide covers deploying the r/alevel bot to production using Docker and Coolify.

---

## Architecture overview

Production deployment requires three services:

```mermaid
flowchart LR
    COOLIFY[Coolify Server]
    BOT[Bot Container - Dockerfile]
    REDIS[Redis Service - Coolify]
    ATLAS[MongoDB Atlas]

    COOLIFY --> BOT
    COOLIFY --> REDIS
    BOT -->|REDIS_URL internal| REDIS
    BOT -->|MONGO_URI| ATLAS
    BOT -->|TOKEN| DISCORD[Discord API]
```

| Service | Where | Purpose |
|---------|-------|---------|
| Bot application | Coolify (Docker) | Runs `node index.js` |
| Redis | Coolify service | Message counters, finalize locks |
| MongoDB | MongoDB Atlas | All persistent data |
| Discord | External | Gateway + REST API |

---

## Prerequisites

- Coolify instance with Docker support
- MongoDB Atlas cluster (production tier recommended)
- Discord bot application with privileged intents enabled
- Git repository connected to Coolify
- All environment variables documented in [Environment Variables](environment-variables.md)

---

## Step 1: MongoDB Atlas

1. Create a production cluster in a region close to your Coolify server
2. Create a database user with read/write access
3. Under **Network Access**, add your Coolify server's public IP
4. Copy the connection string:

```
MONGO_URI=mongodb+srv://user:pass@cluster.mongodb.net/r_alevel_bot?retryWrites=true&w=majority
```

Set this in Coolify's environment panel for the bot application.

---

## Step 2: Redis service in Coolify

Redis is **required** — the bot crashes without `REDIS_URL`.

1. In Coolify, create a new **Redis** service
2. Deploy it on the same network as your bot application
3. Copy the **internal** connection URL (not the public URL)

Example internal URLs:

```
redis://redis:6379
redis://<service-name>:6379
```

4. Set `REDIS_URL` in the bot application's environment variables

**Why internal URL?** The bot container communicates with Redis over Coolify's internal Docker network. Public Redis URLs expose unnecessary attack surface.

### Local development equivalent

```bash
brew install redis && brew services start redis
REDIS_URL=redis://127.0.0.1:6379
```

---

## Step 3: Bot application in Coolify

### Docker build

The repository includes a `Dockerfile`:

```dockerfile
FROM node:20-bookworm-slim
WORKDIR /app

# Native build tools for @napi-rs/canvas
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json ./
RUN npm install --omit=dev && npm cache clean --force

COPY . .
ENV NODE_ENV=production
RUN chown -R node:node /app
USER node

CMD ["node", "index.js"]
```

Key points:

- **Node 20** — matches local development requirement
- **Native deps** — `python3`, `make`, `g++` for `@napi-rs/canvas` (welcome images)
- **Non-root user** — runs as `node` for security
- **No `.env` in image** — secrets injected at runtime via Coolify

### `.dockerignore`

The following are excluded from the Docker build context:

```
node_modules, .env, .env.*, .git, *.md, Dockerfile, .dockerignore
```

All secrets must be set in Coolify's environment panel.

### Coolify setup

1. Create a new application in Coolify
2. Connect your Git repository
3. Set build method to **Dockerfile**
4. Add all environment variables (see checklist below)
5. Deploy

---

## Step 4: Environment variables in Coolify

Copy every variable from `.env.example` into Coolify's environment panel. At minimum:

```
TOKEN=...
MONGO_URI=...
REDIS_URL=redis://<internal-redis-host>:6379
GUILD_ID=...
CLIENT_ID=...
```

Plus all channel IDs, role IDs, and optional variables. See [Environment Variables](environment-variables.md) for the complete list.

**Important:**

- Use `ROLE_BEGINNER_ROLE_ID` (not just `BEGINNER_ROLE_ID`) for reputation tier assignment
- Use `ENGAGEMENT_TRIAL_ROLE_ID` (not `ENGAGEMENT_TRIALIST_ROLE_ID`)
- Do not wrap values in quotes unless the value itself contains spaces

---

## Step 5: Deploy slash commands

Slash commands are **not** registered by the Docker container automatically. After first deploy (or after adding/changing commands):

```bash
# Run locally or in a one-off Coolify shell with env vars set
node scripts/deploy-commands.js
```

Requires `TOKEN`, `CLIENT_ID`, `GUILD_ID`.

This registers all commands to the guild specified by `GUILD_ID`. Commands appear immediately.

---

## Redeployment process

### Normal code update

1. Push changes to the connected Git branch
2. Coolify detects the push and rebuilds the Docker image
3. Container restarts with `node index.js`
4. If commands changed: run `node scripts/deploy-commands.js` separately
5. Verify in Coolify logs and Discord

### Environment variable update

1. Edit variables in Coolify's environment panel
2. Redeploy/restart the application (Coolify usually prompts for this)
3. No rebuild needed unless code also changed

### After Redis or MongoDB changes

1. Update `REDIS_URL` or `MONGO_URI` in Coolify
2. Restart the bot container
3. Check logs for connection success:
   - `✅ MongoDB Connected`
   - No Redis connection errors

---

## Production checklist

Before going live, verify:

- [ ] `TOKEN` is valid and bot has `Server Members Intent` + `Message Content Intent`
- [ ] `MONGO_URI` connects (Atlas IP whitelist includes Coolify server IP)
- [ ] `REDIS_URL` points to internal Coolify Redis service
- [ ] `GUILD_ID` is the production server ID
- [ ] All `*_CHANNEL` and `*_ROLE_ID` variables are set
- [ ] Slash commands deployed: `node scripts/deploy-commands.js`
- [ ] Bot appears online in Discord
- [ ] Test `/ping` works
- [ ] Test a restricted command with correct role
- [ ] Check Coolify logs for errors on startup
- [ ] QOTD rotation document exists in MongoDB (if using QOTD)
- [ ] Rank role IDs in `systems/rankSystem.js` match production server roles

---

## Monitoring

### Coolify logs

Watch for these on startup:

```
✅ MongoDB Connected
Loaded N stickies into cache
```

Watch for these errors:

```
REDIS_URL is required          → missing env var
Redis connection error:        → Redis unreachable
MongoDB connection error       → Atlas IP/URI issue
Error: Used disallowed intents → enable intents in Developer Portal
```

### Health checks

| Check | How |
|-------|-----|
| Bot online | Green status in Discord member list |
| Commands work | Run `/ping` |
| Redis working | Send messages, check Redis keys exist |
| MongoDB working | Run a command that reads DB (e.g. `/my-reputation`) |
| Finalize working | Check logs at 6 AM IST for `[FINALIZE]` messages |

---

## Scaling notes

This bot is designed as a **single-instance** application:

- Redis locks prevent double finalize — running multiple instances could cause race conditions
- In-memory caches (`client.stickies`, `processedMessageIds`) are not shared across instances
- Run **one bot container** per Discord server

If you need high availability, implement leader election or move caches to Redis before running multiple instances.

---

## Related docs

- [Setup](setup.md) — local development
- [Environment Variables](environment-variables.md) — all configuration
- [Troubleshooting](troubleshooting.md) — common production issues
