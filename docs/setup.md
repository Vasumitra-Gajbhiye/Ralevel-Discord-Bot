# Setup

This guide gets the bot running on your machine, connected to your **own** test Discord server, bot and database. Plan for about 30–45 minutes the first time.

You'll end up with:

- a **test Discord server**, a copy of r/alevel's roles and channels, with no members or messages
- your **own bot** (its own token) in that server
- **MongoDB and Redis** running locally in Docker
- the bot running locally and reloading when you save a file

> **Why your own of everything?** Two copies of the bot in one server would both react to every message (XP, sticky messages and so on). Your own setup also means you can't break anything real. You never need the production token or database.

---

## Prerequisites

Install these first:

| Tool | Notes |
|------|-------|
| **Git** | [git-scm.com/downloads](https://git-scm.com/downloads) |
| **Node.js 20 LTS** | [nodejs.org](https://nodejs.org). Matches the Dockerfile. |
| **pnpm** | Run `corepack enable` once after installing Node. It comes with Node. |
| **Docker** | [OrbStack](https://orbstack.dev) (Mac, recommended) or [Docker Desktop](https://www.docker.com/products/docker-desktop/). Keep it running while you develop. |
| **VS Code** | Recommended editor |

In Discord, turn on **Developer Mode** (User Settings → Advanced). It lets you right-click to copy server, role and channel IDs.

---

## 1. Create your test server

1. Ask a maintainer for the **server template link**.
2. Open it and click **Create Server**. You now have every r/alevel role and channel.
3. In your new server, give yourself the **Admin** role (Server Settings → Members). Many commands check roles, not just server ownership.

---

## 2. Create your bot

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications) and click **New Application**. Name it e.g. `ralevel-dev-yourname`.
2. **General Information:** copy the **Application ID**. This is your `CLIENT_ID`.
3. **Bot** tab:
   - Click **Reset Token** and copy it. This is your `TOKEN`. Treat it like a password.
   - Under **Privileged Gateway Intents**, turn on **Server Members Intent** and **Message Content Intent**, then save.
4. **OAuth2 → URL Generator:**
   - Scopes: `bot` and `applications.commands`
   - Bot permissions: `Administrator` (fine for a private test server)
   - Open the generated URL and add the bot to **your test server**.

---

## 3. Get the code

```bash
git clone https://github.com/Vasumitra-Gajbhiye/Ralevel-Discord-Bot
cd Ralevel-Discord-Bot
pnpm install
```

---

## 4. Configure `.env`

```bash
cp .env.example .env
```

Open `.env` and set these three:

| Variable | Value |
|----------|-------|
| `TOKEN` | Your bot token (step 2) |
| `CLIENT_ID` | Your Application ID (step 2) |
| `GUILD_ID` | Right-click your test server's icon → **Copy Server ID** |

`MONGO_URI` and `REDIS_URL` already point at the local Docker services, so leave them as they are.

Then fill in all the role and channel IDs automatically:

```bash
pnpm setup:ids
```

This looks up each role and channel by name in your test server and writes the IDs into `.env`. If it lists anything as "not found", that feature won't work until you set the ID, but the bot still runs.

**Never commit `.env`.** It's in `.gitignore`.

---

## 5. Start MongoDB and Redis

```bash
pnpm services:up
```

This starts both in Docker. The first run downloads the images, which takes a minute. Your data persists between restarts. Stop them with `pnpm services:down`.

---

## 6. Run the bot

```bash
pnpm dev:bot
```

You should see `✅ MongoDB Connected` and the bot should come online in your server. Slash commands are registered automatically on startup. Try one in your test server.

The bot restarts automatically when you save a file.

On first start, the bot copies the role/channel IDs from `.env` into the database. After that, the database is the source of truth, and the IDs are edited from the dashboard (**Settings → Roles / Channels**). If you change IDs in `.env` later (e.g. by re-running `pnpm setup:ids`), push them into the database with:

```bash
node apps/bot/scripts/seed-guild-config.js --force
```

---

## 7. (Optional) Run the dashboard

Only needed if you're working on `apps/web`.

1. Ask a maintainer for the **Clerk development keys** and put them in `.env`:
   ```
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
   CLERK_SECRET_KEY=sk_test_...
   ```
   Also ask them to add your email to the Clerk allowlist, so you can sign up.
2. Add your email so your local dashboard lets you in:
   ```
   DASHBOARD_ADMIN_EMAILS=you@example.com
   ```
3. Run it:
   ```bash
   pnpm dev:web
   ```
4. Open [localhost:3000](http://localhost:3000) and sign up with that email.

---

## Every day after that

```bash
pnpm services:up   # if Docker was restarted
pnpm dev:bot       # and/or: pnpm dev:web
```

For branches, commits and pull requests, see [GitHub Workflow](github-workflow.md).

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `REDIS_URL is required` | `.env` is missing or not in the repo root. Run `cp .env.example .env`. |
| MongoDB/Redis connection refused | Docker isn't running, or you didn't run `pnpm services:up`. |
| `Error: Used disallowed intents` | Turn on both privileged intents (step 2.3). |
| Discord login error / `pnpm setup:ids` says token rejected | `TOKEN` is wrong. Reset it in the Developer Portal and paste it again. |
| `pnpm setup:ids` says it can't read `GUILD_ID` | Check `GUILD_ID`, and that your bot is in that server (step 2.4). |
| Commands fail with a permission error | Give yourself the relevant role in your test server, e.g. Admin. |
| Port 27017 or 6379 already in use | You already have MongoDB/Redis running locally. Stop it, or use it and skip `services:up`. |
| `pnpm: command not found` | Run `corepack enable`. |

More: [Troubleshooting](troubleshooting.md).

---

## Verification scripts

Run these after changing core systems:

| Script | Command | Purpose |
|--------|---------|---------|
| Rank system | `pnpm --filter @ralevel/bot verify:rank` | XP rank role assignment logic |
| Poll votes | `pnpm --filter @ralevel/bot verify:poll-votes` | Poll vote integrity (needs `MONGO_URI`) |
| Poll sweeper | `pnpm --filter @ralevel/bot verify:poll-sweeper` | Adaptive deadline scheduling + sweep logic (needs `MONGO_URI`) |
| Sequential IDs | `pnpm --filter @ralevel/bot verify:sequential-ids` | Counter/ID generation (needs `MONGO_URI`) |
| XP flush | `pnpm --filter @ralevel/bot verify:xp-flush` | Redis XP flush + lock behavior |
| Message router | `pnpm --filter @ralevel/bot verify:message-router` | Single MessageCreate listener, rep gating |
| Welcome system | `pnpm --filter @ralevel/bot verify:welcome` | Background image cache (no reload per join) |
| Task display | `pnpm --filter @ralevel/bot verify:task-display` | Cached display message ID (no 50-msg scan per update) |

---

## For maintainers

**Server template:** generated from the r/alevel server under Server Settings → Server Template. Click **Sync Template** after changing roles or channels, so new test servers stay current.

**ID map:** `pnpm setup:ids` reads `apps/bot/scripts/dev-server-map.json`, which maps each env var to a role or channel *name*. After adding a new role/channel env var (or renaming one in the server), rebuild it with a `.env` that points at the real server:

```bash
node apps/bot/scripts/setup-dev-ids.js --export-map
```

**Using Atlas instead of local MongoDB:** set `MONGO_URI=mongodb+srv://...` to any cluster. Never use the production cluster for development.

---

## Next steps

- [GitHub Workflow](github-workflow.md): how to contribute
- [Architecture](architecture.md): how the bot boots and routes events
- [Adding Commands](adding-commands.md): create your first slash command
- [Commands](commands.md): full command reference
