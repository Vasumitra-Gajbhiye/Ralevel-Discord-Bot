# Performance Review — r/alevel Discord Bot

Senior-engineer review of the codebase (~12k LOC, 124 JS files). Focus: bottlenecks, database access patterns, async concurrency, duplication, file size, abstractions, scalability, and caching.

**Stack:** Node.js, discord.js v14, MongoDB/Mongoose, Upstash Redis (REST).

---

## Executive Summary

The bot is a single-process Discord application with several hot paths that do not scale well under load:

1. **Large monolithic files** (`certificates.js`, `logModAction.js`) duplicate logic that should be shared utilities.

Most issues are fixable incrementally. The highest-impact wins are: Redis pipelining and interaction routing consolidation.

---

---

## Medium Severity

### 16. Poll sweeper queries MongoDB every 60 seconds

**Description:** `systems/polls.js` runs `Poll.find({ status: 'active', deadline: { $lte: now } })` on a 1-minute interval forever.

**Severity:** Medium

**Why it matters:** Constant background load even when zero polls are active. With many historical polls, the query still hits the index but wakes the DB 1,440 times/day.

**Files involved:**
- `systems/polls.js`

**Suggested fix:**
- Increase interval to 5 minutes (matches QOTD/finalize pattern), or schedule next run based on nearest deadline.
- Close expired polls lazily on vote/view interaction (already partially done).
- Sequential `closePoll` in sweeper loop — use `Promise.all` with concurrency limit.

---

### 17. QOTD scheduler queries MongoDB every 5 minutes before cutoff

**Description:** `systems/qotd.js` calls `findActiveRotation()` on every tick, even hours before the 6 AM IST reminder window.

**Severity:** Medium

**Why it matters:** Unnecessary DB reads (~288/day). Low per-query cost but avoidable.

**Files involved:**
- `systems/qotd.js`
- `utils/qotdHelpers.js`
- `systems/dailyFinalizeSystem.js` (duplicate `getISTDateInfo`)

**Suggested fix:**
- Cache active rotation in memory; invalidate on admin command or TTL refresh every 30 min.
- Short-circuit time check **before** DB call.
- Remove duplicate `getISTDateInfo` from `dailyFinalizeSystem.js`; import from `utils/qotdHelpers.js`.

---

### 18. Welcome system reloads background image on every join

**Description:** `systems/welcome.js` calls `loadImage(IMAGE_PATH)` for the background on every `guildMemberAdd`.

**Severity:** Medium

**Why it matters:** Disk I/O and image decode on every join. Canvas rendering + avatar fetch is inherently heavy; redundant background load adds avoidable latency during join bursts.

**Files involved:**
- `systems/welcome.js`

**Suggested fix:**
- Load and cache the background buffer once at module init or first use:
  ```js
  let cachedBackground;
  async function getBackground() {
    if (!cachedBackground) cachedBackground = await loadImage(IMAGE_PATH);
    return cachedBackground;
  }
  ```

---

### 19. Task display scans 50 channel messages on every update

**Description:** `utils/taskDisplay.js` fetches the last 50 messages and iterates to find the bot's task embed.

**Severity:** Medium

**Why it matters:** Called on task claim, finish, add, etc. High-churn task channels pay 50-message fetch + scan each time.

**Files involved:**
- `utils/taskDisplay.js`
- All task commands that call `updateTaskDisplay`

**Suggested fix:**
- Store `displayMessageId` per team in MongoDB or Redis (similar to sticky's `lastMessageId`).
- Fall back to channel scan only when ID is missing or message deleted.

---

### 20. Four separate `interactionCreate` handlers

**Description:** `systems/commands.js`, `systems/certificates.js`, `systems/confessions.js`, and `systems/polls.js` each register their own `interactionCreate` listener.

**Severity:** Medium

**Why it matters:** Every interaction (slash commands, buttons, modals, autocomplete) invokes four async function entries. Adds overhead and makes routing harder to reason about.

**Files involved:**
- `systems/commands.js`
- `systems/certificates.js`
- `systems/confessions.js`
- `systems/polls.js`
- `index.js`

**Suggested fix:**
- Single interaction router in `systems/commands.js` (or new `systems/interactions.js`) that delegates by type/customId prefix.
- Register handlers in a Map: `handlers.set('poll_vote:', pollHandler)`.

---

### 21. `connectDB()` not awaited at startup

**Description:** `index.js` calls `connectDB()` without `await`. Commands and schedulers can run before MongoDB is ready.

**Severity:** Medium

**Why it matters:** Race on cold start causes transient query failures, retry storms, and confusing errors. `dailyFinalize.js` and `flushRedisToMongo.js` also call `connectDB()` redundantly.

**Files involved:**
- `index.js`
- `database.js`
- `utils/dailyFinalize.js`
- `utils/flushRedisToMongo.js`

**Suggested fix:**
- Wrap startup in async IIFE: `await connectDB()` before `client.login()`.
- Make `connectDB` idempotent (return existing connection if already connected).
- Remove redundant `connectDB()` calls from jobs once connection is guaranteed.

---

### 22. Reputation tier logic duplicated in three places

**Description:** Tier thresholds, role IDs, and assignment logic are copy-pasted across:
- `systems/reputation.js` (`TIERS`, `ensureTierRoleAndCheckAdded`)
- `utils/assignRepRole.js` (`TIERS`, `assignRepRoleById`)
- `commands/reputation/myrank.js` (display tiers)

**Severity:** Medium

**Why it matters:** Not just maintenance risk — divergent logic causes extra role API calls or inconsistent behavior. Duplicate `members.fetch` + `roles.remove/add` paths.

**Files involved:**
- `systems/reputation.js`
- `utils/assignRepRole.js`
- `commands/reputation/myrank.js`
- `utils/roles.js`

**Suggested fix:**
- Single `config/repTiers.js` exporting tiers + `syncRepTier(guild, member, { announceChannel })`.
- Display-only commands import the same config for labels.

---

### 23. Certificate DM fallback blocks duplicated ~6 times

**Description:** `systems/certificates.js` repeats the same try/DM → catch/post-to-updates-channel pattern for submit, approve, and reject flows.

**Severity:** Medium

**Why it matters:** 594-line file; each interaction path awaits channel fetches and user fetches sequentially. Duplication makes optimization (parallel fetch, shared embed builder) harder.

**Files involved:**
- `systems/certificates.js`

**Suggested fix:**
- Extract `notifyUser(client, userId, { embed, fallbackChannelId })`.
- Extract shared embed builders for approve/reject/submit.
- Parallelize independent fetches: `Promise.all([users.fetch, channels.fetch])`.

---

## Low Severity

### 24. `logModAction.js` is a 403-line if/else embed factory

**Description:** One function handles DB insert and 15+ action-specific embed branches.

**Severity:** Low (maintainability; minor perf on mod actions)

**Why it matters:** Every mod action pays string branching cost. Hard to optimize DB write + Discord send pipeline. DB save and channel fetch are sequential when they could overlap after embed is built.

**Files involved:**
- `utils/logModAction.js`
- All moderation commands calling `logModAction`

**Suggested fix:**
- Split embed builders into a Map keyed by action.
- Build embed synchronously, then `Promise.all([ModLog.create(...), channel.send(...)])` where ordering allows.
- Store rendered moderator tag at write time to avoid future fetches.

---

### 25. `flushRedisToMongo.js` uses sequential `updateOne` in a loop

**Description:** Legacy script iterates `Object.entries(data)` and awaits `User.updateOne` per user.

**Severity:** Low (script, not hot path — but wrong key schema vs current tracker)

**Why it matters:** Uses key `messages:{guildId}:{date}` (single hash) while `messageTracker.js` uses per-user keys `messages:{guildId}:{date}:{userId}`. Script may be dead/ broken. If run, N sequential writes.

**Files involved:**
- `utils/flushRedisToMongo.js`
- `systems/messageTracker.js`

**Suggested fix:**
- Align schema with current tracker or delete obsolete script.
- If kept, use `bulkWrite` like `dailyFinalize.js`.

---

### 26. Leaderboard command uncached

**Description:** `/leaderboard` runs `Reputation.find().sort({ rep: -1 }).limit(10)` on every invocation.

**Severity:** Low

**Why it matters:** Low frequency command, but easy win with caching.

**Files involved:**
- `commands/reputation/leaderboard.js`
- `models/reputation.js`

**Suggested fix:**
- Cache result in Redis or in-memory for 60–300 seconds.
- Invalidate cache on rep change (or accept short staleness).

---

### 27. Rep-ban check on every automatic rep award

**Description:** `RepBan.findOne({ userId })` hits MongoDB for every thank-message rep grant.

**Severity:** Low (unless rep-ban list is large and thanks are frequent)

**Why it matters:** Rep bans are rare; the check is almost always false. Repeated lookups add up on busy servers.

**Files involved:**
- `systems/reputation.js`
- `models/repban.js`

**Suggested fix:**
- Redis set `repban:userIds` synced on ban/unban commands.
- Check `SISMEMBER` O(1) before Mongo fallback.

---

### 28. Large files with extensive commented-out code

**Description:** Several files are 2× larger than necessary due to commented legacy blocks:
- `commands/moderation/audit.js` (~176 lines commented)
- `commands/task/finished-tsk.js`, `commands/task/tasks.js`
- `systems/commands.js` (old loader)

**Severity:** Low

**Why it matters:** Increases cognitive load, review time, and risk of accidentally restoring slow patterns. No runtime perf impact but hurts engineering velocity.

**Files involved:** See above

**Suggested fix:**
- Remove dead code (git history preserves it).
- Split large command files into handler + formatter modules.

---

### 29. Single-process architecture — no horizontal scaling

**Description:** One Node process handles all events, schedulers, and state (`stickyState` Map, bounded `processedMessageIds` cache).

**Severity:** Low (by design for Discord bots)

**Why it matters:** Cannot run multiple instances without duplicated schedulers (double QOTD reminders, double finalize) and inconsistent in-memory state. Discord allows only one gateway connection per token.

**Files involved:**
- `index.js`
- All `setInterval` systems: `qotd.js`, `dailyFinalizeSystem.js`, `polls.js`

**Suggested fix:**
- If scaling is needed: leader election via Redis lock for schedulers; move sticky/reputation dedup state to Redis.
- Document that this bot is intentionally single-instance.

---

### 30. `getRepRecord` find-then-create pattern repeated across commands

**Description:** `findOne` → if null → `create` appears in `myrank.js`, `myrep.js`, `reputation.js`, `addrep.js`, etc.

**Severity:** Low

**Why it matters:** Two round trips and race on concurrent first access.

**Files involved:**
- `systems/reputation.js`
- `commands/reputation/myrank.js`
- `commands/reputation/myrep.js`
- `commands/reputation/addrep.js`
- `commands/reputation/setrep.js`

**Suggested fix:**
- Shared helper: `getOrCreateRep(userId)` using `findOneAndUpdate` with `upsert: true`.
- Or `$setOnInsert` for atomic creation.

---

## Opportunities for Caching (Summary)

| Data | Current | Suggested cache | TTL / invalidation |
|------|---------|-----------------|-------------------|
| Enabled stickies | In-memory `Map` by channelId (implemented) | N/A — already cached | Invalidate on sticky CRUD |
| Rep ban status | Mongo per rep event | Redis SET / in-memory Set | On repban/repunban |
| QOTD rotation | Mongo every 5 min | In-memory + refresh on save | Admin command / 30 min |
| Leaderboard top 10 | Mongo per command | Redis JSON | 60–300s |
| Welcome background | Disk per join | Module-level Image cache | Permanent |
| Task display message ID | 50-msg channel scan | Stored ID in Mongo/Redis | On missing message |
| Mod log moderator tags | Denormalized at write (`moderatorTag` on ModLog/Warning) | N/A — already implemented | N/A |
| Guild member for tier sync | `members.fetch` each time | Use `message.member` when available | N/A |

---

## Suggested Prioritization

| Priority | Issue # | Effort | Impact |
|----------|---------|--------|--------|
| 1 | #20, #22 — Router + shared rep tiers | Medium | Maintainability |

---

## What's Already Done Well

- **Single messageCreate router** in `systems/messageRouter.js` — one listener with shared bot/guild guards dispatches to tracker, sticky, and reputation handlers in parallel.
- **Rank updates during finalize** process only rank-changed users with bounded concurrency (5 parallel Discord jobs per batch) in `systems/rankSystem.js`.
- **Daily finalize MongoDB writes** use `bulkWrite` — good batch pattern (`utils/dailyFinalize.js`).
- **Daily finalize Redis reads** use aggregate guild+date hashes (2 parallel `HGETALL` calls) with pipelined legacy fallback for in-flight per-user keys (`utils/dailyFinalize.js`, `systems/messageTracker.js`).
- **Redis cleanup** uses `Promise.all` for parallel deletes after finalize.
- **Poll votes** are stored in a separate `PollVote` collection with per-user atomic `findOneAndUpdate` operations (`utils/applyPollVote.js`, `models/pollVote.js`).
- **Sequential public IDs** (poll, confession, task) use an atomic MongoDB counter collection with `$inc` and startup `$max` seeding (`models/counter.js`, `utils/getNextSequenceId.js`, `database.js`).
- **Poll model** has sensible compound index `{ status: 1, deadline: 1 }`.
- **Common query indexes** on `reputations.rep`, `users.xp`, and `tasks.team` support leaderboard sorts and team task lookups. Task compound indexes on `{ team, assignedTo }`, `{ team, finishedBy }`, and `{ team, selected }` support `/my-progress` count queries. Verified via `npm run verify:database-indexes` and `npm run verify:my-progress`.
- **Audit, moderation-logs, and moderator-logs commands** paginate at DB level with `skip/limit/.lean()` and compound indexes on ModLog.
- **Moderation log moderator tags** are denormalized at write (`moderatorTag` on ModLog/Warning); read commands use stored tags with a batched Discord fallback only for legacy rows missing the field (`utils/fetchModeratorTags.js`).
- **Message counting** offloads hot path to Redis instead of Mongo — correct architecture choice.
- **Message tracker** batches `HINCRBY`, `HSET`, and key `EXPIRE` in a single Redis pipeline per message (`systems/messageTracker.js`).
- **Permission checks** in `systems/commands.js` use role cache (`roles.cache`) — no extra API calls.
- **Sticky system** uses an in-memory enabled-channel cache loaded on startup, refreshed on CRUD commands, with debounced `lastMessageId` persistence on automatic reposts — no Mongo query per message.
- **Automatic reputation awards** use atomic `$inc` / `bulkWrite` with batched ban checks for mention thanks; tier sync reuses the awarded rep total (no duplicate DB reads). Verified via `npm run verify:reputation`.
- **Reputation dedup cache** uses a bounded in-memory FIFO set (10k message IDs) to prevent double-awarding without unbounded memory growth.

---

*Review date: 2026-06-21. Based on static analysis of the repository at commit time.*
