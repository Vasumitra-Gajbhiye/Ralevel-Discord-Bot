# Performance Review — r/alevel Discord Bot

Senior-engineer review of the codebase (~12k LOC, 124 JS files). Focus: bottlenecks, database access patterns, async concurrency, duplication, file size, abstractions, scalability, and caching.

**Stack:** Node.js, discord.js v14, MongoDB/Mongoose, Upstash Redis (REST).

---

## Executive Summary

The bot is a single-process Discord application with several hot paths that do not scale well under load:

1. **Every guild message** can trigger up to three `messageCreate` handlers, each doing I/O (Redis and/or MongoDB).
2. **Reputation and poll voting** use read-modify-write patterns without atomic updates or caching.
3. **Moderation log commands** load entire collections into memory and perform N+1 Discord user fetches.
4. **Large monolithic files** (`certificates.js`, `logModAction.js`) duplicate logic that should be shared utilities.

Most issues are fixable incrementally. The highest-impact wins are: Redis pipelining and adding missing indexes.

---

## Critical & High Severity

### 5. Modlog commands load unbounded result sets

**Description:** `commands/moderation/modlogs.js` and `commands/moderation/moderatorlogs.js` call `ModLog.find(...).sort(...)` with **no `.limit()`**, loading every log for a user/moderator into memory.

**Severity:** High

**Why it matters:** Mod logs accumulate indefinitely. A prolific moderator or long-tenured user can have thousands of entries. This causes slow queries, high memory use, and Discord embed pagination built from a full in-memory array.

**Files involved:**
- `commands/moderation/modlogs.js`
- `commands/moderation/moderatorlogs.js`
- `models/modlog.js`

**Suggested fix:**
- Paginate at the database layer: `.skip(page * PAGE_SIZE).limit(PAGE_SIZE)` (like `commands/moderation/audit.js` already does).
- Add compound index: `{ userId: 1, timestamp: -1 }` and `{ moderatorId: 1, timestamp: -1 }`.
- Use `.lean()` on read-only queries.

---

### 6. N+1 Discord API calls in modlogs and warnings

**Description:** After loading all logs, `modlogs.js` fetches each moderator via `interaction.client.users.fetch(log.moderatorId)` inside a `for` loop. `warnings.js` does the same per warning.

**Severity:** High

**Why it matters:** 100 logs = 100 sequential Discord REST calls. Discord caches help only after the first fetch; cold fetches dominate latency.

**Files involved:**
- `commands/moderation/modlogs.js`
- `commands/moderation/warnings.js`

**Suggested fix:**
- Collect unique `moderatorId` values, then `Promise.all(ids.map(id => client.users.fetch(id).catch(() => null)))` into a Map.
- Better long-term: store `moderatorTag` at write time in `utils/logModAction.js` (already available) and stop fetching on read.

---

### 7. Poll votes use non-atomic read-modify-write

**Description:** Each vote loads the full poll document, mutates the embedded `votes` array in memory, and saves the entire document (`systems/polls.js` → `poll.save()`).

**Severity:** High

**Why it matters:** Concurrent votes on the same poll can race and lose updates. As `votes` grows, documents bloat — every vote rewrites the full array. MongoDB document size limit (16 MB) becomes a real constraint for large polls.

**Files involved:**
- `systems/polls.js`
- `models/poll.js`
- `commands/moderation/poll.js`

**Suggested fix:**
- Use positional atomic updates: `$pull` / `$addToSet` on `votes` with `arrayFilters`, or store votes in a separate `PollVote` collection keyed by `{ pollId, userId }`.
- For vote counts only, use `$inc` on option counters and keep voter detail in a separate collection for breakdown view.

---

### 8. Race-prone sequential ID generation

**Description:** `getNextConfessionId()`, `getNextPollId()`, and similar patterns do `findOne().sort({ id: -1 })` then `+ 1` before insert.

**Severity:** High

**Why it matters:** Two simultaneous submissions can read the same "last" ID and collide on the unique index, causing retries or failures under load.

**Files involved:**
- `systems/confessions.js` (`getNextConfessionId`)
- `utils/getNextPollId.js`
- `commands/task/addtask.js` (latest task lookup)

**Suggested fix:**
- Use a MongoDB counter collection with `findOneAndUpdate({ _id: 'pollId' }, { $inc: { seq: 1 } }, { upsert: true, new: true })`.
- Or use MongoDB native auto-increment / UUID for public IDs.

---

### 9. Daily finalize lock key mismatch (correctness + duplicate runs)

**Description:** `systems/dailyFinalizeSystem.js` checks lock key `processed:{guildId}:{today}` but `utils/dailyFinalize.js` sets/checks `processed:{guildId}:{yesterday}`.

**Severity:** High

**Why it matters:** The outer guard does not prevent re-entry correctly. Finalize can run multiple times per day if the inner lock is not set yet, doubling MongoDB writes, rank updates, and Redis cleanup work.

**Files involved:**
- `systems/dailyFinalizeSystem.js`
- `utils/dailyFinalize.js`

**Suggested fix:**
- Use one canonical date (yesterday) for both check and set, in one place.
- Set the lock **before** processing (with short TTL + idempotent finalize) to prevent concurrent runs across restarts.

---

## Medium Severity

### 10. Three separate `messageCreate` handlers per message

**Description:** `systems/messageTracker.js`, `systems/reputation.js`, and `systems/sticky.js` each register independent `messageCreate` listeners.

**Severity:** Medium

**Why it matters:** Every handler adds async work to the event loop for every message. Reputation and tracker both run on high-traffic channels; combined latency stacks.

**Files involved:**
- `index.js`
- `systems/messageTracker.js`
- `systems/reputation.js`
- `systems/sticky.js`

**Suggested fix:**
- Consolidate into a single `messageCreate` router that early-returns and dispatches to sub-modules.
- Share cheap guards (bot check, guild check, disabled channel list) once.

---

### 11. Message tracker: two sequential Redis calls per message

**Description:** Each message awaits `redis.hincrby` then `redis.hset` separately.

**Severity:** Medium

**Why it matters:** Doubles REST latency for the hottest code path. At 50 msg/s this is ~100 Redis requests/s.

**Files involved:**
- `systems/messageTracker.js`

**Suggested fix:**
- Use a pipeline: `[hincrby, hset]` in one round trip.
- Or use `HINCRBY` for count only and infer booster status at finalize time via Discord API / cached role set (if accuracy allows).
- Set TTL on keys at first write (`EXPIRE` 48h) to prevent unbounded key growth if finalize fails.

---

### 12. Reputation system: multiple DB queries per thank message

**Description:** `addReputation()` calls `RepBan.findOne`, then `getRepRecord()` (`findOne` + possible `create`), then `save()`. `ensureTierRoleAndCheckAdded()` calls `RepBan.findOne` again and `getRepRecord()` again, plus `members.fetch`.

**Severity:** Medium

**Why it matters:** A single "thanks @user" message with 3 mentions can trigger 15+ DB queries and 3+ Discord API calls, plus 3 channel messages.

**Files involved:**
- `systems/reputation.js`
- `models/reputation.js`
- `models/repban.js`

**Suggested fix:**
- Replace find+create+save with `findOneAndUpdate({ userId }, { $inc: { rep: 1 } }, { upsert: true, new: true })`.
- Check rep ban once; pass result to tier sync.
- Batch mention rep awards: one `$inc` per user, one combined channel message.
- Cache rep-ban list in memory with TTL or Redis `SISMEMBER`.

---

### 13. `processedMessageIds` Set grows without bound

**Description:** `systems/reputation.js` keeps every processed message ID in an in-process `Set` forever.

**Severity:** Medium

**Why it matters:** Long-running bot process accumulates unbounded memory (one string ID per processed message, never pruned).

**Files involved:**
- `systems/reputation.js`

**Suggested fix:**
- Use LRU cache with max size (e.g. 10k entries).
- Or rely on idempotency at DB level (`$inc` only once per message via a `processedMessages` collection with TTL index).

---

### 14. Missing database indexes for common query patterns

**Description:** Several frequent queries lack supporting indexes.

**Severity:** Medium

**Why it matters:** Full collection scans degrade as data grows.

**Files involved:**
- `models/reputation.js` — leaderboard: `.sort({ rep: -1 })` needs `{ rep: -1 }` index
- `models/User.js` — no index on `xp` (used in rank calculations / potential leaderboards)
- `models/task.js` — `Task.find({ team })` in `commands/task/my-progress.js` has no `team` index
- `models/modlog.js` — missing `{ userId: 1, timestamp: -1 }`, `{ moderatorId: 1, timestamp: -1 }`

**Suggested fix:**
```js
// examples
ReputationSchema.index({ rep: -1 });
UserSchema.index({ xp: -1 });
taskSchema.index({ team: 1 });
ModLogSchema.index({ userId: 1, timestamp: -1 });
ModLogSchema.index({ moderatorId: 1, timestamp: -1 });
```

---

### 15. `my-progress` loads entire team task collection

**Description:** `commands/task/my-progress.js` fetches all tasks for a team with `Task.find({ team })`, then filters in JavaScript.

**Severity:** Medium

**Why it matters:** As task history grows, every progress check transfers and parses all documents. Arrays like `assignedTo` and `finishedBy` make documents large.

**Files involved:**
- `commands/task/my-progress.js`
- `models/task.js`

**Suggested fix:**
- Use targeted aggregation:
  ```js
  Task.countDocuments({ team });
  Task.countDocuments({ team, assignedTo: userId });
  Task.countDocuments({ team, finishedBy: userId });
  Task.countDocuments({ team, selected: userId });
  ```
- Add `{ team: 1 }` index and consider multikey indexes on array fields if needed.

---

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
- Add `{ rep: -1 }` index (see issue #14).

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
- `commands/task/my-progress.js`, `commands/task/finished-tsk.js`, `commands/task/tasks.js`
- `systems/commands.js` (old loader)

**Severity:** Low

**Why it matters:** Increases cognitive load, review time, and risk of accidentally restoring slow patterns. No runtime perf impact but hurts engineering velocity.

**Files involved:** See above

**Suggested fix:**
- Remove dead code (git history preserves it).
- Split large command files into handler + formatter modules.

---

### 29. Single-process architecture — no horizontal scaling

**Description:** One Node process handles all events, schedulers, and state (`stickyState` Map, `processedMessageIds` Set).

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
| Mod log moderator tags | Discord fetch per log | Denormalize at write | N/A |
| Guild member for tier sync | `members.fetch` each time | Use `message.member` when available | N/A |

---

## Suggested Prioritization

| Priority | Issue # | Effort | Impact |
|----------|---------|--------|--------|
| 1 | #9 — Finalize lock key mismatch | Low | High (correctness) |
| 2 | #5, #6 — Modlog unbounded + N+1 | Medium | High |
| 3 | #11 — Redis pipeline in messageTracker | Low | High |
| 4 | #12, #13 — Reputation query batching + Set leak | Medium | Medium |
| 5 | #14 — Missing indexes | Low | Medium (grows over time) |
| 6 | #7, #8 — Poll atomicity + ID counters | Medium | Medium |
| 7 | #20, #22 — Router + shared rep tiers | Medium | Maintainability |

---

## What's Already Done Well

- **Rank updates during finalize** process only rank-changed users with bounded concurrency (5 parallel Discord jobs per batch) in `systems/rankSystem.js`.
- **Daily finalize MongoDB writes** use `bulkWrite` — good batch pattern (`utils/dailyFinalize.js`).
- **Daily finalize Redis reads** use aggregate guild+date hashes (2 parallel `HGETALL` calls) with pipelined legacy fallback for in-flight per-user keys (`utils/dailyFinalize.js`, `systems/messageTracker.js`).
- **Redis cleanup** uses `Promise.all` for parallel deletes after finalize.
- **Poll model** has sensible compound index `{ status: 1, deadline: 1 }`.
- **Audit command** paginates at DB level with `skip/limit` — use as template for modlogs.
- **Message counting** offloads hot path to Redis instead of Mongo — correct architecture choice.
- **Permission checks** in `systems/commands.js` use role cache (`roles.cache`) — no extra API calls.
- **Sticky system** uses an in-memory enabled-channel cache loaded on startup, refreshed on CRUD commands, with debounced `lastMessageId` persistence on automatic reposts — no Mongo query per message.

---

*Review date: 2026-06-21. Based on static analysis of the repository at commit time.*
