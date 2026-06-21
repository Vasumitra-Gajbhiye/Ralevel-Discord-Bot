# Troubleshooting

Common problems and fixes for the r/alevel Discord bot. Organized by symptom.

For setup basics, see [Setup](setup.md). For configuration reference, see [Environment Variables](environment-variables.md).

---

## Startup failures

### `REDIS_URL is required`

**Symptom:** Bot crashes immediately on start with:

```
Error: REDIS_URL is required
    at Object.<anonymous> (/app/redis.js:4:9)
```

**Cause:** `REDIS_URL` is missing or empty in `.env` or Coolify env panel.

**Fix:**

1. Set `REDIS_URL` in your environment
2. Local: `REDIS_URL=redis://127.0.0.1:6379` (start Redis first)
3. Production: use Coolify Redis internal URL
4. Verify: `redis-cli ping` → `PONG`

---

### Discord login failed / `Error [TokenInvalid]`

**Symptom:** Bot fails to connect; error mentions invalid token.

**Cause:** Wrong, expired, or regenerated `TOKEN`.

**Fix:**

1. Go to [Discord Developer Portal](https://discord.com/developers/applications) → Your App → Bot
2. Reset Token and copy the new value
3. Update `TOKEN` in `.env` or Coolify
4. Restart the bot

---

### `Error: Used disallowed intents`

**Symptom:** Bot crashes on login with disallowed intents error.

**Cause:** Privileged intents not enabled in Developer Portal.

**Fix:**

1. Developer Portal → Your App → Bot
2. Enable **Server Members Intent**
3. Enable **Message Content Intent**
4. Save and restart the bot

---

### MongoDB connection timeout

**Symptom:**

```
MongooseServerSelectionError: connect ETIMEDOUT
```

Or bot starts but DB commands fail silently.

**Cause:** IP not whitelisted in Atlas, wrong URI, or VPN blocking connection.

**Fix:**

1. MongoDB Atlas → Network Access → Add your current IP (or Coolify server IP)
2. Verify `MONGO_URI` username, password, and cluster hostname
3. Disable VPN and retry
4. Test URI with `mongosh "<MONGO_URI>"`

---

### Bot online but slash commands missing

**Symptom:** Bot shows as online but typing `/` shows no bot commands.

**Cause:** Commands not deployed to Discord API.

**Fix:**

```bash
node scripts/deploy-commands.js
```

Requires `TOKEN`, `CLIENT_ID`, `GUILD_ID`. Commands appear immediately (guild-scoped).

Also verify the bot has `applications.commands` scope if re-inviting.

---

### Bot starts but crashes on first command

**Symptom:** Bot connects but commands fail with MongoDB errors.

**Cause:** `connectDB()` is not awaited in `index.js` — race condition on cold start.

**Fix (workaround):** Wait a few seconds after startup before testing commands. Permanent fix requires awaiting `connectDB()` before `client.login()` in code.

---

## Permission issues

### `You do not have permission to use this command`

**Symptom:** Ephemeral error when running a restricted command.

**Cause:** User lacks required role, or role ID missing from `.env`.

**Fix:**

1. Check `permissions.config.js` for the command's allowed roles
2. Verify the corresponding `*_ROLE_ID` env vars are set correctly
3. Ensure the user's Discord role ID matches an allowed role
4. Check for **name mismatches** (see below)

---

### `/setnickname` or `/sethelper` open to everyone

**Symptom:** Any member can use these commands despite being intended as staff-only.

**Cause:** Config key mismatch in `permissions.config.js`:

| Config key | Actual slash name |
|------------|-------------------|
| `set-nickname` | `setnickname` |
| `set-helper` | `sethelper` |

**Fix:** Update `permissions.config.js` to use the exact slash names:

```javascript
setnickname: [admin, dcHead, srMods, ialAgent],
sethelper: [admin, hlpHead, dcHead],
```

Then restart the bot (no redeploy needed for permission config changes).

---

### `/softban` accessible to all members

**Symptom:** Non-staff can use `/softban`.

**Cause:** `softban` is not listed in `permissions.config.js`.

**Fix:** Add to permissions config:

```javascript
softban: [admin, dcHead, srMods, jrMods],
```

---

### Moderation command blocked on valid target

**Symptom:** "You cannot moderate this user" for a lower-ranked member.

**Cause:** Role hierarchy check in `systems/commands.js`.

**Fix:**

1. Ensure the moderator's highest role is above the target's highest role
2. Bot's role must be above both users' roles
3. Cannot moderate users with `@everyone` only if mod also has no roles

---

## Reputation issues

### Reputation not awarded on thank-you messages

**Symptom:** User says "thanks" but rep doesn't increase.

**Possible causes and fixes:**

| Cause | Fix |
|-------|-----|
| Channel in `DISABLED_CHANNELS` | Remove channel ID from env var |
| Category in `DISABLED_CATEGORIES` | Remove category ID from env var |
| User is rep-banned | Check with `/list-rep-ban` |
| Message not a reply or mention | Rep only triggers on replies/mentions with thank phrases |
| Already processed | Reputation system deduplicates by message ID |

---

### Beginner rep tier role not assigned

**Symptom:** User reaches 10+ rep but doesn't get Beginner role.

**Cause:** Code reads `ROLE_BEGINNER_ROLE_ID` but `.env` may only have `BEGINNER_ROLE_ID`.

**Fix:** Add to `.env`:

```
ROLE_BEGINNER_ROLE_ID=<same ID as BEGINNER_ROLE_ID>
```

Restart the bot.

---

## XP and message tracking

### XP not updating / ranks not changing

**Symptom:** User sends messages but XP stays at 0.

**Diagnosis steps:**

1. Check Redis has message counts:
   ```bash
   redis-cli HGETALL messages:<GUILD_ID>:<YYYY-MM-DD>
   ```
2. Check finalize ran (logs at 6 AM IST):
   ```
   🔥 [FINALIZE] Running for 2026-06-19 at 6:0 IST
   ```
3. Check MongoDB user document:
   ```javascript
   db.users.findOne({ _id: "<userId>" })
   ```
4. Verify `GUILD_ID` and `BOOSTER_ROLE_ID` are set

**Common causes:**

| Cause | Fix |
|-------|-----|
| Redis not running | Start Redis, set `REDIS_URL` |
| Finalize lock exists | Check `GET processed:<guildId>:<date>` — delete if stale |
| Wrong `GUILD_ID` | Must match the server where messages are sent |
| Before 6 AM IST | XP flushes once daily; wait for finalize |

---

### Double finalize / skipped finalize

**Symptom:** Finalize runs twice or never runs.

**Cause:** Redis lock key `processed:{guildId}:{date}`.

**Fix:**

- If stuck (lock exists but finalize didn't complete): delete the lock key:
  ```bash
  redis-cli DEL processed:<GUILD_ID>:<YYYY-MM-DD>
  ```
- If running twice: should not happen with `SET NX` — check for multiple bot instances

---

## Sticky messages

### Sticky not reposting

**Symptom:** Sticky message never reappears after threshold messages.

**Fix:**

1. Verify sticky exists: `/sticky-list`
2. Check bot loaded cache on startup: log should show `Loaded N stickies into cache`
3. Ensure sticky is `enabled: true` in MongoDB
4. Default threshold is 8 messages — send enough messages in the channel
5. Bot must have permission to send/delete messages in the channel

---

### Sticky content outdated after edit

**Symptom:** Edited sticky still shows old content.

**Fix:** Use `/edit-sticky` (updates MongoDB + cache). If cache is stale, restart the bot to reload from MongoDB.

---

## QOTD

### QOTD reminder not sending

**Symptom:** No daily QOTD reminder at 6 AM IST.

**Fix:**

1. Set `QOTD_REMINDER_CHANNEL_ID` in env
2. Ensure a `QotdRotation` document exists in MongoDB with `enabled: true` and non-empty `modOrder`
3. Check logs for `[QOTD] Skip:` messages explaining why
4. Use `/qotd-status` to inspect rotation state

---

## Polls

### Poll not closing at deadline

**Symptom:** Poll stays active past its deadline.

**Fix:**

1. Verify poll has a `deadline` set in MongoDB
2. Check bot logs for poll sweeper errors (runs every 60 seconds)
3. Bot needs permission to edit the poll message in the channel
4. Manually close by editing the poll in MongoDB: `{ status: "closed" }`

---

### Poll vote not registering

**Symptom:** User clicks vote button but count doesn't change.

**Fix:**

1. Check user has one of the `allowedRoleIds` on the poll
2. Verify poll status is `active`
3. Check MongoDB `pollvotes` collection for the vote document
4. Run `npm run verify:poll-votes` to test vote logic

---

## Certificates

### Certificate updates posted to wrong channel

**Symptom:** Certificate delivery updates appear in review channel instead of public updates channel.

**Cause:** Bug in `commands/certificates/mark-cert-delivered.js` — reads `REVIEW_CHANNEL` instead of `CERT_UPDATES_CHANNEL`.

**Fix:** Code change required. Until fixed, manually post updates to `CERT_UPDATES_CHANNEL`.

---

## Confessions

### Confession approve button fails

**Symptom:** Mod clicks Approve but nothing happens or error occurs.

**Cause:** Known bug — approve handler references undefined `replyText` / `attachment` variables in `systems/confessions.js`.

**Fix:** Code change required. Check bot logs for the specific error.

---

## Deployment issues

### Canvas/welcome image fails in Docker

**Symptom:** Welcome images fail; error about native modules.

**Cause:** Missing native build dependencies in Docker image.

**Fix:** Dockerfile already includes `python3`, `make`, `g++`. Rebuild the image. If still failing, check `@napi-rs/canvas` version compatibility with Node 20.

---

### Environment variables not applied after Coolify update

**Symptom:** Changed env var but bot still uses old value.

**Fix:** Restart/redeploy the application in Coolify after changing env vars. Coolify does not hot-reload env changes.

---

## Development tips

| Tip | Detail |
|-----|--------|
| Use `npm run dev` | Nodemon auto-restarts on file changes |
| Run verify scripts | After changing core systems: `npm run verify:*` |
| Check Coolify logs | Production issues — filter for `ERROR`, `FINALIZE`, `QOTD`, `Redis` |
| VPN blocks Atlas | Disable VPN when MongoDB won't connect locally |
| Permission config changes | No redeploy needed — just restart the bot process |
| Command changes | Always run `node scripts/deploy-commands.js` after adding/editing commands |

---

## Known bugs (require code fixes)

| Bug | Location | Impact |
|-----|----------|--------|
| Permission name mismatch | `permissions.config.js` | `setnickname`, `sethelper` bypass role gate |
| `softban` not in permissions | `permissions.config.js` | Public access |
| Beginner role env var name | `systems/reputation.js` | Tier role not assigned |
| Confession approve path | `systems/confessions.js` | Approve button broken |
| Cert delivered channel | `mark-cert-delivered.js` | Wrong channel for updates |
| `connectDB()` not awaited | `index.js` | Race on cold start |

---

## Getting help

If none of the above resolves your issue:

1. Check Coolify/terminal logs for the full error stack trace
2. Verify all env vars against [Environment Variables](environment-variables.md)
3. Run relevant verify script (`npm run verify:*`)
4. Ask in the team Discord server with: error message, what you tried, and relevant log lines

---

## Related docs

- [Setup](setup.md) — initial configuration
- [Deployment](deployment.md) — production setup
- [Systems](systems.md) — how each system works
- [Database](database.md) — inspect Redis keys and MongoDB collections
