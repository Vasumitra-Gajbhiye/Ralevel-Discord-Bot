# Setup

This guide walks a new developer through cloning the repository, installing dependencies, configuring services, and running the bot locally.

## Prerequisites

Install the following before you begin:

| Tool | Version | Purpose |
|------|---------|---------|
| **Git** | Latest | Clone and manage the repository |
| **Node.js** | 20 LTS (matches Dockerfile) | Runtime |
| **npm** | Bundled with Node | Package manager |
| **Redis** | 6+ | Required at startup — message counters and finalize locks |
| **MongoDB Atlas account** | Free tier OK | Persistent data storage |

You also need:

- Access to the [Discord Developer Portal](https://discord.com/developers/applications) for your bot application
- **Privileged intents enabled** on the bot: `Server Members Intent`, `Message Content Intent`
- Discord **Developer Mode** enabled (User Settings → Advanced) to copy channel and role IDs
- Role and channel IDs from a server admin (or copy from team documentation)

---

## 1. Clone the repository

```bash
git clone https://github.com/Vasumitra-Gajbhiye/Ralevel-Discord-Bot
cd Ralevel-Discord-Bot
```

The local folder name may differ (e.g. `r-alevel bot code`). All commands below assume you are in the project root where `index.js` and `package.json` live.

---

## 2. Install dependencies

```bash
npm install
```

This installs production dependencies including `discord.js`, `mongoose`, `ioredis`, and `@napi-rs/canvas`. Dev dependency `nodemon` is used for local hot reload.

---

## 3. Install and start Redis

Redis is **mandatory**. The bot crashes on startup if `REDIS_URL` is not set:

```javascript
// redis.js
if (!process.env.REDIS_URL) {
  throw new Error("REDIS_URL is required");
}
```

### macOS (Homebrew)

```bash
brew install redis
brew services start redis
```

Default local URL:

```
REDIS_URL=redis://127.0.0.1:6379
```

### Linux

```bash
sudo apt install redis-server
sudo systemctl start redis
```

### Verify Redis is running

```bash
redis-cli ping
# Expected: PONG
```

For production Redis on Coolify, see [Deployment](deployment.md).

---

## 4. Configure MongoDB

### Create an Atlas cluster

1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) and create a free cluster
2. Choose a region close to your deployment (or your location for local dev)
3. Create a database user with read/write access
4. Under **Network Access**, allow your IP (or `0.0.0.0/0` for development only)

### Connection string

Format:

```
MONGO_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/r_alevel_bot?retryWrites=true&w=majority
```

On first connect, the bot seeds atomic ID counters from existing data:

```javascript
// database.js — seeds pollId, confessionId, taskId counters
await seedCounters();
console.log("✅ MongoDB Connected");
```

**VPN note:** If MongoDB fails to connect, try disabling your VPN — Atlas IP whitelisting often blocks VPN egress IPs.

---

## 5. Obtain environment variables

### Discord credentials

| Variable | Where to get it |
|----------|-----------------|
| `TOKEN` | Developer Portal → Your App → Bot → Reset Token / Copy Token |
| `CLIENT_ID` | Developer Portal → Your App → General Information → Application ID |
| `GUILD_ID` | Discord → right-click your server → Copy Server ID (Developer Mode on) |

### Channel and role IDs

Right-click any channel or role in Discord → **Copy ID** (Developer Mode must be enabled).

You need IDs for every variable listed in [Environment Variables](environment-variables.md). Copy the template:

```bash
cp .env.example .env
```

Fill in all values. **Never commit `.env`** — it is in `.gitignore` and `.dockerignore`.

---

## 6. Create your `.env` file

```bash
cp .env.example .env
```

Edit `.env` with your real values. Minimum required to start:

```
TOKEN=...
MONGO_URI=...
REDIS_URL=redis://127.0.0.1:6379
GUILD_ID=...
```

Many features need additional channel and role IDs. See [Environment Variables](environment-variables.md) for the full list.

### Known naming gotchas

Set **both** of these if you use reputation tier roles:

```
ROLE_BEGINNER_ROLE_ID=...   # Used by reputation auto-assignment
BEGINNER_ROLE_ID=...        # Used by permissions.config.js
```

The code reads `ROLE_BEGINNER_ROLE_ID` for rep tier assignment but `BEGINNER_ROLE_ID` for permissions. Use the exact name `ENGAGEMENT_TRIAL_ROLE_ID` (not `ENGAGEMENT_TRIALIST_ROLE_ID`).

---

## 7. Run the bot locally

### Development (auto-reload)

```bash
npm run dev
```

Uses `nodemon index.js` — restarts when you save files.

### Production-style

```bash
npm start
# equivalent to: node index.js
```

### Expected startup output

```
✅ MongoDB Connected
```

The bot should appear online in Discord. If slash commands are missing, deploy them (next section).

---

## 8. Deploy slash commands

Slash commands are **not** registered automatically at startup. After adding or changing commands:

```bash
node scripts/deploy-commands.js
```

Requires `TOKEN`, `CLIENT_ID`, and `GUILD_ID` in `.env`.

This registers commands to **one guild only** (instant updates, no global propagation delay):

```javascript
// scripts/deploy-commands.js
Routes.applicationGuildCommands(clientId, guildId)
```

---

## 9. Verification scripts

Run these after changing core systems:

| Script | Command | Purpose |
|--------|---------|---------|
| Rank system | `npm run verify:rank` | XP rank role assignment logic |
| Poll votes | `npm run verify:poll-votes` | Poll vote integrity (needs `MONGO_URI`) |
| Poll sweeper | `npm run verify:poll-sweeper` | Adaptive deadline scheduling + sweep logic (needs `MONGO_URI`) |
| Sequential IDs | `npm run verify:sequential-ids` | Counter/ID generation (needs `MONGO_URI`) |
| Daily finalize | `npm run verify:finalize` | Redis finalize + lock behavior |
| Message router | `npm run verify:message-router` | Single MessageCreate listener, rep gating |
| Welcome system | `npm run verify:welcome` | Background image cache (no reload per join) |
| Task display | `npm run verify:task-display` | Cached display message ID (no 50-msg scan per update) |

---

## 10. Troubleshooting startup

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `REDIS_URL is required` | Missing or empty `REDIS_URL` | Set URL, start Redis |
| `Error: Used disallowed intents` | Intents not enabled in Developer Portal | Enable Members + Message Content intents |
| Discord login error | Invalid or revoked `TOKEN` | Regenerate token in Developer Portal |
| MongoDB timeout | IP not whitelisted or VPN | Add IP in Atlas, disable VPN |
| Bot online, no slash commands | Commands not deployed | Run `node scripts/deploy-commands.js` |
| Commands fail with permission error | Missing role IDs in `.env` | Fill all `*_ROLE_ID` variables |

Full troubleshooting guide: [Troubleshooting](troubleshooting.md).

---

## Next steps

- [Architecture](architecture.md) — understand how the bot boots and routes events
- [Commands](commands.md) — full command reference
- [Adding Commands](adding-commands.md) — create your first slash command
- [Deployment](deployment.md) — deploy to production with Coolify
