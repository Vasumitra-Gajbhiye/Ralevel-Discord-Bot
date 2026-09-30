# Exam channel locking v1: audit

Repo: `/Users/vasumitra/Code/ralevel-discord-bot` · HEAD `da6efab` · v1 commit `49b72a1` ("added channel locking v1", 2026-08-01) · audited 2026-09-30.
Scope: read-only. No repo files were modified. Line numbers are for HEAD. No exam-lock file has changed since `49b72a1`: `git log 49b72a1..HEAD` is empty for all of them.

---

## 0. TL;DR

- v1 is a clean, small **DB-mediated state machine**. `ExamPaper{status, lockAt, unlockAt, channelIds, forceUnlock, cancelAfterUnlock}` feeds an **adaptive `setTimeout` sweeper** in the bot, which is a near clone of `utils/pollSweeper.js`. The web dashboard only writes Mongo. The bot learns about changes by polling every 60 s or less. `wakeExamLockSystem` is exported but **never called**.
- A lock is only an `@everyone` `SendMessages` overwrite. Unlock sets that bit to **neutral (null)**. That erases whatever was there before, so a manual `/lock` or a read-only channel gets cleared. Role overwrites that allow SendMessages, and threads (`SendMessagesInThreads`), bypass the lock. Manual `/lock` and `/unlock` are not coordinated with exam locks in either direction.
- The biggest correctness risks are **non-atomic claims** (Discord work happens before the status is persisted) combined with web edit, cancel and delete being allowed while the DB still says `scheduled`. This can orphan permanent locks or silently ignore a cancel. The sweeper queries also have **no `guildId` filter**, so any other process sharing `MONGO_URI` acts on production papers. That includes a dev bot and `verify-exam-lock.js`.
- Time handling is **UTC `HH:mm` only**, with the same UTC date for start and end. This cannot express Cambridge local times, DST changes, or windows that cross 00:00 UTC. The Oct/Nov 2026 series crosses the UK DST change on 2026-10-25 and the US one on 2026-11-01.
- For v2, keep the sweeper, the status machine, the overlap check, the logging, the API and auth patterns and the page shell. Add new timetable models for series, zones, subjects and per-zone sittings, and compile them into v1-shaped lock windows (`lockAt`/`unlockAt` = hull across zones). Add a per-channel lock-state record that snapshots and restores the original overwrites and reference-counts holders (exam and manual). Details are in §4.

---

## 1. How v1 works end to end

### 1.1 Files and wiring

| Layer | File | Role |
|---|---|---|
| Model | `packages/db/src/models/examSession.js:5-63` | Session = name + 4 UTC `HH:mm` strings + `status` |
| Model | `packages/db/src/models/examPaper.js:5-87` | Paper = label, date, slot, channelIds, lockAt/unlockAt, lifecycle flags |
| Window math | `packages/db/src/examWindows.js:10-44` | `combineDateAndUtcTime`, `computePaperWindow` |
| Exports | `packages/db/index.js:36-37,72-77,114-115,144-147`; `index.d.ts:37-53` | Models + helpers exported to bot and web |
| Bot system | `apps/bot/systems/examLockSystem.js` (401 lines) | Sweeper, lock/unlock, overlap, logging |
| Bot util | `apps/bot/utils/channelLock.js:9-22` | `lockChannel` / `unlockChannel` (@everyone SendMessages) |
| Bot wiring | `apps/bot/index.js:26,79` | `examLockSystem(client)` called **before** `client.login` (`:82`) |
| Manual cmds | `apps/bot/commands/moderation/lock.js:36`, `unlock.js:36` | Refactored to reuse `channelLock.js`; otherwise unchanged |
| Status cmd | `apps/bot/commands/moderation/lock-status.js:106-219` | Untouched by v1; no exam awareness |
| Web API | `apps/web/src/app/api/exam-sessions/route.ts` (GET/POST), `[id]/route.ts` (GET/PATCH/DELETE), `[id]/papers/route.ts` (POST), `[id]/papers/[paperId]/route.ts` (PATCH/DELETE) | CRUD + actions |
| Web lib | `apps/web/src/lib/db.ts:31-32,37-39,79-85` | Models/helpers added to `ensureDb()` |
| Nav | `apps/web/src/lib/nav.ts:50` | "Operations → Exam locking" |
| UI | `apps/web/src/app/(dashboard)/ops/exam-locking/page.tsx` (766 lines) | Single client page |
| Test | `apps/bot/scripts/verify-exam-lock.js` (568 lines); `apps/bot/package.json` `verify:exam-lock` | Unit + **live Discord** tests |
| Docs | none | `grep -i exam docs/*.md` only hits Definitions; exam locking is undocumented |

### 1.2 Data model

**ExamSession** (`examSession.js`)
- `guildId` (indexed), `name`, `amStartUtc`, `amEndUtc`, `pmStartUtc`, `pmEndUtc`. Each time is validated by `/^([01]\d|2[0-3]):[0-5]\d$/` at `:3,17-48`.
- `status: active|archived` (`:49-54`), timestamps, index `{guildId, status}` (`:59`).
- There is one AM window and one PM window per session. There is no zone, time zone, series type or year.

**ExamPaper** (`examPaper.js`)
- `sessionId` (ref), `guildId`, `label` (free text), `date` (`YYYY-MM-DD`), `slot: AM|PM`, `channelIds: [String]` (must be non-empty, `:36-43`).
- `lockAt`, `unlockAt` (Date, required, **denormalised/derived**, `:44-53`).
- `status: scheduled|locked|unlocked|cancelled` (`:54-59`), `lockedAt`, `unlockedAt`.
- Command flags written by the web and consumed by the bot: `forceUnlock` (`:68-72`) and `cancelAfterUnlock` (`:73-76`).
- Indexes: `{status, lockAt}`, `{status, unlockAt}`, `{sessionId, status}`, `{channelIds, status}` (`:81-84`). No index starts with `guildId` apart from the single-field one.

### 1.3 How lockAt/unlockAt are computed, and when they are recomputed

- `computePaperWindow(session, {date, slot})` (`examWindows.js:29-44`) picks the AM or PM pair and builds `Date.UTC(y, m-1, d, hh, mm)` for both ends **on the same UTC date** (`:18-20,34-35`). It throws if `unlockAt <= lockAt` (`:37-41`).
- Computed **in the web API only**:
  - Paper create: `papers/route.ts:60-63`.
  - Paper PATCH (only if `status === "scheduled"`): `[paperId]/route.ts:94-125`. It recomputes from the *current* session times even when only the label changed.
  - Session PATCH, when any of the 4 times changed (`[id]/route.ts:121-125`): loops over **scheduled** papers only and re-saves each one (`:136-161`). Papers that are **locked** keep their old `unlockAt`, as documented in the UI at `page.tsx:552-555`. The session is saved first (`:133`) and papers are saved one by one, with no transaction.
- `assertSlotOrder` (end must be after start, in minutes) is duplicated in `route.ts:28-44` and `[id]/route.ts:30-46`. It throws a plain `Error`, which lands in the `catch` and becomes **HTTP 500** instead of 400.
- zod `timeUtcSchema` slices to 5 chars, so it accepts `07:00:00` (`route.ts:8-11`).

### 1.4 Sweeper scheduling (bot)

`examLockSystem.js`, structurally identical to `utils/pollSweeper.js:8-107`:
- Constants: `IDLE_INTERVAL_MS = MAX_INTERVAL_MS = 60 s`, `STARTUP_DELAY_MS = 10 s`, `CONCURRENCY = 3` (`:7-10`).
- `getNextExamEventAt()` (`:25-59`) finds the earliest `scheduled.lockAt` or `locked.unlockAt` (non-forced). If any `locked && forceUnlock` exists it returns `now`.
- `computeNextSweepDelay` (`:14-19`) caps the delay at 60 s, and returns 0 if the next event is overdue. In practice the bot **polls Mongo at least once a minute**, which is how it notices web changes.
- `runSweeper` (`:356-366`) runs `sweepExamLocks` and then, in `finally`, `scheduleNextSweep` (`:346-354`). Only one timer exists, so sweeps never overlap unless `wakeExamLockSystem` fires during a sweep. Nothing calls it today.
- `sweepExamLocks` (`:339-344`) runs `processDueLocks` then `processDueUnlocks`. Locks go first so that back-to-back papers on the same channel do not flap.
- `processDueLocks` (`:270-298`) finds `scheduled && lockAt <= now`. If `unlockAt <= now` already (bot was down), it marks the paper `unlocked` without locking (`:282-290`). Otherwise it calls `applyLock`. Papers are processed in batches of 3.
- `processDueUnlocks` (`:300-318`) finds `locked && (forceUnlock || unlockAt <= now)` and calls `applyUnlock`.

### 1.5 Lock and unlock mechanics

- `lockChannel` (`channelLock.js:9-13`): `permissionOverwrites.edit(@everyone, {SendMessages: false})`. discord.js `edit` merges with the cached existing overwrite (`PermissionOverwriteManager.edit`, which uses `resolveOverwriteOptions`). Other bits are kept. A previous explicit **allow** on SendMessages is removed and replaced with a deny.
- `unlockChannel` (`:18-22`): `SendMessages: null`, meaning neutral. This removes both allow and deny for that bit, so the **previous state is lost**. If the overwrite did not exist before the lock, an empty `@everyone` overwrite is left behind.
- `applyLock(client, paper)` (`examLockSystem.js:169-210`), per channel, sequentially:
  1. fetch the channel (`fetchTextChannel`, `:158-167`, which returns null if it is missing or has no `permissionOverwrites`)
  2. `lockChannel`
  3. post the red "Channel locked for exams" embed in the channel, with the unlock time as a plain UTC string (`:21-23,185-193`)
  4. `logExamAction`
  
  Only after all channels does it set `status = "locked"`, `lockedAt`, `forceUnlock = false` and save (`:206-209`).
- `applyUnlock` (`:212-268`), per channel:
  1. `channelStillCovered`
  2. fetch
  3. if not covered: `unlockChannel` and a green "Channel unlocked … is over" embed
  4. always a ModLog entry if the channel exists
  
  Then `status = cancelled` if `cancelAfterUnlock`, else `unlocked`, clears the flags, and saves (`:259-267`).

### 1.6 Overlap handling

`channelStillCovered(channelId, excludingPaperId, now)` (`:64-87`) treats a channel as still covered if another paper with that channel is:
- `locked`, not force-unlocked, with `unlockAt > now`, or
- `scheduled` with `lockAt <= now < unlockAt`.

It is only consulted on **unlock**. If a channel is covered, the Discord unlock is skipped and a ModLog entry still records it, with "(Discord unlock skipped — overlapping paper)" (`:241-256`). On **lock**, nothing checks whether the channel is already locked, so each overlapping paper posts its own lock notice. The query ignores `guildId` (harmless, because snowflakes are unique) and **ignores manual locks entirely**.

### 1.7 Force unlock, cancel and delete flows

| Action (web) | Allowed when | What the web does | What the bot does |
|---|---|---|---|
| Cancel | `scheduled` | `status = cancelled` immediately (`[paperId]/route.ts:70-74`) | nothing |
| Cancel | `locked` | `forceUnlock = true`, `cancelAfterUnlock = true` (`:75-79`) | next sweep (≤60 s): `applyUnlock(forced)` then `status = cancelled` |
| Cancel | `unlocked`/`cancelled` | 409 (`:64-69`) | n/a |
| Force unlock | `locked` only (`:82-92`) | `forceUnlock = true` | next sweep: `applyUnlock(forced)` then `status = unlocked`. The paper **does not relock**. |
| Edit label/date/slot/channelIds | `scheduled` only (`:94-99`) | recompute window, save | picked up on next query. **Not exposed in the UI.** |
| Delete paper | anything except `locked` (`:160-168`) | `deleteOne` | n/a |
| Delete session | no paper `locked` (`[id]/route.ts:196-209`) | `deleteMany` papers + delete session (`:211-212`) | n/a |
| Archive session | always | `status = archived` | **nothing**. The sweeper never reads ExamSession, so archived sessions' papers still lock. |

Force-unlock on a paper whose channel is also covered by another paper does *not* open the channel (`channelStillCovered`). There is no way to force-open a single channel.

### 1.8 Startup reconciliation and downtime behaviour

`startExamLockSystem` (`:368-383`) runs 10 s after `start()`, at the same time `client.login` is in flight. It does not check `client.isReady()`, unlike `qotd.js:30-33` and `certForfeitSweeper.js:50-53`. It then runs:
- `reconcileActiveWindows` (`:323-337`): locks `scheduled` papers whose window contains now. This duplicates `processDueLocks`.
- then `sweepExamLocks`: unlocks `locked` papers whose `unlockAt` passed while the bot was down, and marks missed windows `unlocked`.

It does **not** verify that `locked` papers really have the overwrite in Discord, re-assert locks, or detect orphaned denies. If the bot dies mid-`applyLock`, the paper stays `scheduled` with some channels already locked. On restart everything is re-locked, which duplicates the notices, but the result is correct.

### 1.9 How the web notifies the bot: it doesn't

- `wakeExamLockSystem` (`examLockSystem.js:385-389`) is exported (`:393`) and referenced **nowhere** else (`grep -rn wakeExamLockSystem apps packages` only matches the definition). Compare `wakePollSweeper`, which *is* called in-process by `/poll` (`commands/moderation/poll.js:196`).
- **Redis** is bot-only: `apps/bot/redis.js:3-5` requires `REDIS_URL`. It is used only by `messageTracker` and `xpFlush` (`docs/database.md:590`: "Redis is used only for high-frequency message counting and XP flush locking"). The web has no ioredis dependency and no `REDIS_URL`. There is no pub/sub anywhere (`grep subscribe|publish(` finds nothing).
- **HTTP**: `apps/bot/systems/commandSyncServer.js:49-92` is the only bot↔web channel. It is an opt-in HTTP server (`SYNC_HTTP_PORT` + `INTERNAL_SYNC_SECRET`, bearer check at `:68-73`) with one route, `POST /internal/commands/sync`. The web calls it from `apps/web/src/lib/discordSync.ts:46-75` via `BOT_INTERNAL_SYNC_URL`, but only when the web lacks `TOKEN`/`CLIENT_ID`/`GUILD_ID` (`:77-94`). Exam routes do not use it.
- **GuildConfig** uses its own mechanism: a 15 s `updatedAt` poll (`apps/bot/utils/loadGuildConfig.js:7,91-106`).
- Net effect: web changes reach the bot on the next ≤60 s sweep. The toasts say "Force unlock queued — bot will unlock shortly" (`page.tsx:302`), which is accurate but gives no confirmation. The page has no status polling or auto-refresh.

### 1.10 Logging

- **Console**: `[exam-lock] …` for failures and skips.
- **ModLog** document per channel per action (`logExamAction`, `:89-156`):
  - `action`: `exam-lock-channel` / `exam-unlock-channel` / `exam-force-unlock-channel`
  - `userId: "N/A"`, `targetTag: "Everyone"`, `moderatorId`/`moderatorTag` = the bot (or `"bot"`/`"Exam Lock System"` if `client.user` is not ready yet)
  - `actionId` = `crypto.randomUUID()` (`utils/generateId.js`)
  - `channelTag` is written but is **not in the ModLog schema** (`packages/db/src/models/modlog.js`), so strict mode drops it silently.
- **modLog channel embed** per channel per action: `getChannelId("modLog")` from GuildConfig (`:117`), fields Paper/Slot/Channel/Moderator/Reason/Action ID. The title always uses 🔒, even for unlocks (`:133`).
- **Not logged**: dashboard actions (create, edit, cancel, force-unlock, delete). The routes ignore `authResult.userId`/`email`. Lock failures, skipped deleted channels, and missed windows (`:282-290`) are console-only.
- A paper with N channels produces N in-channel notices + N ModLog docs + N modLog embeds on lock, and the same again on unlock.

### 1.11 API auth and permission checks

- Every handler starts with `requireAllowlistedAuth()` (`apps/web/src/lib/auth.ts:30-40`), which means a Clerk `auth()` userId plus a primary email in the `DashboardAccess` allowlist. That allowlist is cached for 60 s and the seed email always passes (`apps/web/src/lib/access.ts:4,57-76`). The response is 401 for no session, 403 for not allowlisted.
- Layers above that: `middleware.ts` (`auth.protect()` for everything except sign-in/up) and the dashboard layout redirect (`app/(dashboard)/layout.tsx:12-18`).
- There is **no role or permission granularity**. Every allowlisted user can do everything, including scheduling a lock on *any* snowflake. Channel IDs are only regex-checked (`/^\d{17,20}$/`, `papers/route.ts:9,15`) and never verified to exist in the guild.
- Scoping: every query filters `guildId = process.env.GUILD_ID` (`route.ts:52-57,91-100`; `[id]/route.ts:57-67,105,137-141,191-211`; `papers/route.ts:43-48`; `[paperId]/route.ts:49-58,146-155`). That is correct for a single guild.
- The same pattern is used by all 12 API routes: inline `unauthorized()` helper, zod `safeParse`, `{error}` JSON responses.

### 1.12 Dashboard UX: what an admin does step by step

`page.tsx`:
1. **Create session** card (`:322-389`): name (placeholder "May/June 2026"), then AM start/end and PM start/end as `<input type="time">` labelled **UTC**, with defaults 07:00–12:00 and 12:00–18:00 (`:36-42`). The admin has to convert Cambridge local times to UTC by hand.
2. **Sessions** table (`:391-448`): Open or Close a session. There is no filter or search. Sessions are sorted newest first (`route.ts:57-59`).
3. On an opened session (`:450-726`):
   - Edit name and times → "Save session" (`:524-532`). A note says only scheduled papers are recomputed (`:552-555`).
   - Archive or Restore (`:533-543`). This is cosmetic, see 1.7.
   - Delete session, behind a ConfirmModal (`:544-550,729-737`).
   - **Add paper** (`:557-621`): label (free text, "Maths P1"), date, slot AM/PM, **Channels** via `ChannelIdPicker`, *or* "paste Discord channel ID" + "Add ID" (`:596-613,228-244`). Then "Add paper".
   - Papers table (`:623-722`): label/date/slot, **raw channel IDs** (`:643-647`), lock/unlock in UTC (`:648-651`), status + "(unlock queued)" (`:652-657`). Actions: Cancel (scheduled or locked), Force unlock (locked), Delete (not locked). All go through ConfirmModal (`:739-763`).
   - There is **no way to edit an existing paper** in the UI. `runPaperAction` only sends `{action}` (`:290-297`), although the PATCH route supports label/date/slot/channelIds.

**Channel picking, confirmed:** `channelOptions` is built from `useGuildConfig().config.channels` (`page.tsx:62-71`). That is the GuildConfig `channels: [{key, label, channelId}]` registry (`packages/db/src/models/guildConfig.js:17-24,165`). It is seeded from the 13 functional `CHANNEL_DEFS` (`packages/db/src/defaultGuildConfig.js:65-79`: application, review, modLog, welcome, …) and admins can extend it under Settings → Channels (`settings/channels/page.tsx`). `ChannelSearchMenu` hides entries with an empty `channelId` (`components/ChannelSearchMenu.tsx:29`).

The paper stores the **resolved channelId**, not the key. If the registry is edited later, existing papers are unaffected. Subject channels are not in that registry, so in practice admins must first add them to Settings → Channels, which pollutes the functional registry, or paste raw IDs, which then display as bare numbers. The picker's remove-confirm text is the default "Remove … from disabled channels? Changes apply after you save." (`ChannelIdPicker.tsx:176-178`), because the exam page doesn't pass `removeConfirmMessage` (`page.tsx:590-594`).

### 1.13 Tests

`apps/bot/scripts/verify-exam-lock.js`:
- **Unit tests**: `computePaperWindow`, `computeNextSweepDelay` (`:84-148`).
- **Mongo tests** against the real `MONGO_URI`, using the name prefix `__verify_exam_lock__`: `channelStillCovered`, `getNextExamEventAt` (`:150-244`).
- **Live Discord tests**: they log in as the bot (`:495-538`) and lock/unlock a **hard-coded channel `1450047433433415733`** (`:28`), covering lock+unlock, timed unlock via sweep, force unlock, overlap, and past-window skip (`:258-493`).
- `sweepExamLocks(client)` is called globally (`:344,380,478`), so it processes every due paper in the DB, not just test papers. `ensureUnlocked` (`:70-80`) nulls the test channel's @everyone SendMessages.
- Other verify scripts use mock clients (`verify-poll-sweeper.js:63-76`) or pure stubs with no DB at all (`verify-definitions.js:34-56`, `verify-mod-points.js:106+`). This is the only verify script that logs into Discord.

---

## 2. Bugs and risks

Severity: **H** = can leave channels wrongly locked or unlocked, or corrupt state, in normal operation. **M** = operational or reliability gap. **L** = cosmetic, minor, or edge case.

### H1. Unlock clobbers pre-existing overwrites; manual and exam locks trample each other
- `channelLock.js:18-22` sets `SendMessages: null` unconditionally.
  - If the channel already denied @everyone SendMessages (read-only channel, or a manual `/lock` placed before the exam), the exam unlock **opens it**.
  - If it had an explicit *allow*, that allow is lost after the lock/unlock cycle (`:9-13` replaces it).
- `channelStillCovered` (`examLockSystem.js:64-87`) only looks at ExamPaper, so a manual `/lock` is invisible to it.
- A manual `/unlock` (`unlock.js:36`) during an exam removes the deny. The paper stays `locked` in the DB, nothing re-asserts it, and at `unlockAt` an "unlocked … is over" notice is still posted.
- A manual `/lock` during an exam is undone at the exam's unlock.
- Side effect: an empty `@everyone` overwrite is left behind. Any overwrite edit also takes the channel out of "synced with category". Future category permission edits then stop propagating to it (Discord behaviour, not verified on the live server).
- **Fix:** a per-channel lock record that snapshots the prior overwrite bits (tri-state) and keeps a holder set (`exam:<paperId>`, `manual:<modId>`). Restore the snapshot only when the last holder releases. Make `/lock`, `/unlock` and `/lock-status` holder-aware. For example, `/unlock` during an exam asks for confirmation and records a `manualOverride`.

### H2. The lock can be ineffective: role overwrites, threads, forums
- `lockChannel` denies only on `@everyone` (`channelLock.js:10-12`). Discord evaluates role overwrites *after* @everyone, and a role **allow** beats the @everyone deny.
- Subject channels in this server are role-gated. The welcome text says "Select/edit your subject roles … to access subject channels" (`guildConfig.js:205`). If those subject-role overwrites grant `SendMessages` (common) and not just `ViewChannel`, the exam lock does nothing for exactly the members it targets. **Verify on the live server.**
- `SendMessagesInThreads` is not denied, so existing threads stay writable. Forum channels (replies are thread messages) stay writable too. Forum and category channels also have no `send()`, so the notice fails; errors are caught at `:194-196`.
- Category IDs pasted as "channel IDs" pass `fetchTextChannel` (categories have `permissionOverwrites`) and get the overwrite. That behaviour is untested.
- **Fix:**
  - Deny `SendMessages`, `SendMessagesInThreads`, `CreatePublicThreads`, `CreatePrivateThreads` and optionally `AddReactions`.
  - Also deny on every role overwrite in the channel that *allows* those bits (snapshot and restore them as well), or at least do a preflight "effective permission" check that warns in the dashboard.
  - Validate the channel type.

### H3. Non-atomic claim: races between web edits and the sweeper can orphan locks or drop a cancel
The sweeper loads the doc, does all Discord work, and only then saves `status: "locked"` (`examLockSystem.js:173-209`). For N channels that is about 5 REST calls each (fetch, overwrite, notice, ModLog insert, log channel fetch + send), so the window can last many seconds. Throughout it, the DB still says `scheduled`, and the web allows:
- **Cancel** (`[paperId]/route.ts:70-74`) sets `cancelled`. The bot's `paper.save()` then writes `status: "locked"` over it. The cancel is silently lost and the paper runs its full window.
- **Edit channelIds/date** (`:94-125`). The bot locked the *old* channels, but the saved doc now lists the *new* ones (Mongoose saves only modified paths). At unlock the new list is unlocked and **the old channels stay locked forever**.
- **Delete paper** (`:160-171`) or **delete session** (`[id]/route.ts:196-212`, which only checks `locked`). The bot's `save()` throws `DocumentNotFoundError` (Mongoose 7.8.11, `lib/model.js:434`), caught at `:292-294`. The channels are already locked, no record exists, and **nothing will ever unlock them**.
- The same shape applies on unlock, though that is less harmful.
- **Fix:**
  - Claim atomically first: `findOneAndUpdate({_id, status:"scheduled"}, {$set:{status:"locking", claimedAt, claimToken}})`. Do the Discord work, then set `locked` guarded by the token. This is the reverse of the order `pollSweeper.closePoll` already uses: it persists `closed` *before* touching Discord (`utils/pollSweeper.js:38-42`).
  - Have the web use conditional updates (`findOneAndUpdate({_id, status:"scheduled"})`) and refuse delete or edit for `locking`/`locked`.
  - Better still, reconcile desired vs. actual channel state every sweep (§4), so any orphan self-heals.

### H4. No guildId filter and no instance guard in the sweeper
- The sweeper queries `ExamPaper.find/findOne` without `guildId` (`examLockSystem.js:29-49,65-69,271-274,301-304,324-328`).
- Any second process on the same `MONGO_URI` acts on every guild's papers: a local `pnpm dev:bot` with a different `GUILD_ID`, a second container, or `verify-exam-lock.js` (global `sweepExamLocks` at `:344,380,478`).
- A process that cannot see the channels still flips the status. `fetchTextChannel` returns null, the loop `continue`s, and the paper is saved `locked` or `unlocked` (`:206-209,259-267`). The real bot then skips it.
- Two bots in the same guild would double-lock and double-post.
- The docs say the bot is single-instance (`docs/deployment.md:289-295`), but nothing enforces it.
- **Fix:** filter by `guildId: process.env.GUILD_ID` everywhere. Rely on the atomic claim from H3. Make the verify script use a fake `guildId` and mocks.

### H5. Time model: UTC-only, no DST, no midnight crossing
- Times are `HH:mm` UTC strings on the session (`examSession.js:17-48`), combined with the paper's date **on the same UTC date** (`examWindows.js:34-35`). End must be after start (`:37-41`, and `assertSlotOrder` in both routes).
- Consequences:
  - Cambridge publishes times in **local** time per zone. Admins must convert by hand, and a single UTC value is wrong for part of any series that spans a DST change.
  - The **Oct/Nov 2026** series starts right after today (2026-09-30). The UK leaves BST on **2026-10-25** and the US leaves DST on **2026-11-01**. Feb/March 2027 crosses the US change on 2027-03-14 and the UK change on 2027-03-28.
  - A window that starts before 00:00 UTC cannot be expressed at all. Example: a 08:00 local morning in a UTC+9 or later zone is 23:00 UTC the previous day. A multi-zone hull from the earliest-east start to the latest-west end will often cross UTC midnight.
  - Lock notices show a raw UTC string (`:21-23,190`), not a Discord `<t:unix:F>` timestamp in each reader's local time.
- **v1 stopgap for Oct/Nov 2026**: split the series into two sessions (before and after DST) and enter hull windows in UTC. This still fails for windows that cross midnight.

### M1. No web→bot signal (latency ≤60 s, no feedback)
`wakeExamLockSystem` is unused (§1.9). Force-unlock, cancel-while-locked, and new papers whose window already started all wait up to 60 s. The UI doesn't auto-refresh, so the admin can't see when it actually happened. If v2 adds a wake, add an in-flight guard. Today, a wake during a running sweep would start a *concurrent* `runSweeper` (`:385-389`: `clearTimeout` + `setTimeout(0)` without checking whether a sweep is running), which leads to double locks and notices.

### M2. Sweeper can crash the process, or die
`scheduleNextSweep` (`:346-354`) runs inside `finally` and does a DB query (`getNextExamEventAt`). If it rejects (Mongo outage longer than the ~10 s buffer), the promise returned by `runSweeper`, which the `setTimeout` arrow started, is **unhandled**. The same applies to the startup `setTimeout(async …)` (`:371-380`). The repo has no `process.on("unhandledRejection")` (grep finds none), and Node 20's default is to crash. Coolify would restart the bot, but every system restarts with it. The same latent issue exists in `pollSweeper.js:85-95`. **Fix:** wrap the reschedule in try/catch and fall back to `setTimeout(runSweeper, IDLE_INTERVAL_MS)`.

### M3. Possible hot loop on persistent per-paper failure
If a due paper keeps failing, for example `applyUnlock`'s `save()` throwing for a force-unlock paper, then `getNextExamEventAt` returns `now` or a past time. The delay becomes 0 (`:14-18,52`) and the sweeper spins against Mongo with no backoff. **Fix:** add a per-paper `attempts`/`lastError`/`nextAttemptAt`, and set a minimum delay of about 1–5 s.

### M4. "Archive" does nothing
The sweeper never reads ExamSession, so archived sessions' scheduled papers still lock. Papers can also be added to archived sessions (`papers/route.ts:48-51` does not check status). Either make archive mean "no future locks" (cascade-cancel scheduled papers, or filter via `sessionId ∈ active`) or rename it.

### M5. Silent failures
- `applyLock` marks the paper `locked` even if **every** channel failed to fetch or lock. Deleted channels, missing Manage Roles, or a wrong ID are all swallowed (`:173-182,206-209`).
- Failures produce no ModLog and no modLog embed, and the dashboard shows nothing.
- Missed windows (bot down across the whole window) are marked `unlocked` with only a console line (`:282-290`), so they are indistinguishable from real unlocks.
- The unlock notice says "… is over" even for a mid-exam force unlock (`:233-235`).
- **Fix:** store per-channel results on the paper (`channelResults: [{channelId, lockedOk, error}]`), add a `missed` status, show both in the UI, and post one failure summary to modLog.

### M6. Edits after papers exist
- Session time edits deliberately skip `locked` papers (`[id]/route.ts:136-161`). Extending an exam's end while it is running therefore has no effect.
- A paper edited, or created, with a past date is silently marked `unlocked` on the next sweep. There is no validation or warning (`papers/route.ts:13`, `[paperId]/route.ts:13-16`).
- A paper edited to "now" locks within 60 s.
- A session edit is not atomic with its paper updates.

### M7. No reconciliation against Discord state
The system is event-driven: it acts once at `lockAt` and once at `unlockAt`. Nothing checks that a `locked` paper's channels are actually locked (manual `/unlock`, another bot, or an admin editing the channel), and nothing finds orphaned denies from H3. Startup reconcile only covers `scheduled` papers (`:323-337`).

### M8. Scale and noise with many channels
- Channels are processed sequentially within a paper, and 3 papers run in parallel, all posting to a single modLog channel. Discord's per-channel message limit throttles the log embeds, and the last channel's lock can lag the first by seconds to tens of seconds.
- The lock is not idempotent at notice level: overlapping papers post duplicate "locked" notices.
- **Fix:** lock all overwrites first, in parallel with a small pool; post notices after; send **one** modLog embed per paper listing the channels.

### M9. Audit trail gaps
- Dashboard actions are not attributed. The routes ignore `authResult.email`, and there is no `createdBy`/`updatedBy`.
- A force unlock appears in ModLog as done by the bot.
- Deleting a session hard-deletes all paper history (`[id]/route.ts:211`).

### M10. Coarse authorization and unvalidated targets
Any allowlisted dashboard user can lock any channel, including staff or announcement channels, by pasting an ID. Nothing checks that the ID is a text channel in `GUILD_ID`. This matches the rest of the dashboard (binary allowlist), but locking has a larger blast radius. Consider validating IDs through the bot (see §3.9) and restricting targets to a subject-channel catalogue.

### L1. `/lock-status` "not working": likely causes
`apps/bot/commands/moderation/lock-status.js:106-219`. It was not touched by v1, and its last change was the monorepo move (`2544800`). I found no guaranteed runtime exception, so these are ranked by likelihood:
1. **Hidden from most moderators.** It registers `setDefaultMemberPermissions(ManageChannels)` (`:116`), and the GuildConfig default is `"lock-status": "ManageChannels"` (`defaultGuildConfig.js:287`). `/lock` and `/unlock` use `BanMembers` (`:237-238`), and the role gate allows `jrMods` for all three (`:325-326,352`). Junior and senior mods who have Ban but not Manage Channels **won't see `/lock-status` at all**. The todo item about lock/unlock access was fixed for `/lock` and `/unlock` only.
2. **Wrong results.** "Permanent" locks are 30 hard-coded channel IDs from the main server (`:132-163`). Every other channel with an @everyone SendMessages deny (announcements, rules, read-only channels, and v1's empty-but-present overwrites) is reported as a "temporary lock". In the dev guild the list is all noise.
3. **Silent truncation.** The list is cut at 1020 chars (`:191,208`), roughly 40 mentions, and can end mid-mention `<#1234…`.
4. **Blind to exam locks and role-based locks.** It doesn't query ExamPaper, so it can't say *why* a channel is locked or until when. It only inspects @everyone overwrites (`:173-178`).

**Fix in v2:** rebuild it on the lock-state records (holders, reason, until), with pagination.

### L2. Startup before the client is ready
`examLockSystem(client)` is called before `client.login` (`apps/bot/index.js:79,82`), with no `client.isReady()` check. Usually harmless because REST works once the token is set. `client.user` may be null, which leads to `moderatorId: "bot"` (`:96-98`).

### L3. No feature flag or kill switch
There is no `features.examLocking` (`guildConfig.js:167-178`). The only way to stop locks is to cancel or delete papers one by one.

### L4. Cosmetic
- 🔒 on unlock log embeds (`:133`).
- ModLog `channelTag` is dropped (not in the schema).
- `assertSlotOrder` returns 500 instead of 400 (`route.ts:88,103-111`).
- An invalid ObjectId in the URL gives 500 (CastError).
- `assertSlotOrder` is duplicated in two files.

### L5. UI gaps
- Raw channel IDs in the table (`page.tsx:643-647`).
- No paper edit (see 1.12).
- No status auto-refresh.
- Misleading remove-confirm text in the picker (see 1.12).
- No local-time preview, no bulk entry, and no sort or filter by date across sessions.
- `useGuildConfig` loads the entire GuildConfig just to get the channel list.

### L6. `verify-exam-lock.js` is unsafe to run against production
- It hard-codes a real channel (`:28`).
- It uses the shared Mongo and a global sweep (`:344,380,478`), which can lock or unlock real papers from a second client.
- Its cleanup deletes ModLogs by regex (`:65-67`), and it nulls the test channel's overwrite (`:70-80`).

### L7. No documentation
Exam locking is absent from `docs/systems.md` (background job table `:33-45`), `docs/commands.md`, `docs/database.md` and `docs/architecture.md` (scheduled jobs `:275-285`).

---

## 3. Reusable assets and conventions for v2

### 3.1 GuildConfig: how it works
- **Schema**: `packages/db/src/models/guildConfig.js:147-345`. It is one doc per guild (`guildId` unique) with typed sub-schemas and a `features` boolean map (`:167-178`). The model is re-registered on hot reload (`:347-351`).
- **Defaults**: `packages/db/src/defaultGuildConfig.js`. `ROLE_DEFS`/`CHANNEL_DEFS` (`:9-79`) map keys to env-var seeds. `buildDefaultGuildConfig(guildId)` is at `:605+`. Command permission defaults are at `:237,287,325…`.
- **Migration**: `packages/db/src/migrateGuildConfig.js:347-557`, `migrateGuildConfigDocument(GuildConfig, guildId)`. It reads the raw doc, builds `$set`/`$unset` for missing or legacy sections (for example `if (!raw.definitions …) $set.definitions = buildDefaultDefinitions()` at `:464-465`), and applies them with `collection.updateOne`.
  - It is idempotent and runs at **bot startup** (`loadGuildConfig.js:44`) and on **every web config GET/PUT** (`apps/web/src/lib/db.ts:96`).
  - `migrateGuildConfigInPlace` is for tests.
  - Adding `examLocking` defaults is a 3-line change there, plus schema, `buildDefault…`, `PATCHABLE` (`api/config/route.ts:43-67`) and `GuildConfigData` (`apps/web/src/lib/useGuildConfig.ts:6-119`).
- **Validation on save**: `PUT /api/config` (`api/config/route.ts:106-225`) runs per-section normalizers from `@ralevel/db` (`normalizeDefinitionsConfig`, `normalizeModPointsConfig`, …) that return `{ok, errors}`. There is also a referential check that refuses to remove subjects or boards still in use (`:78-104,160-176`). Reuse both patterns for an `examLocking` section.
- **Bot cache**: `apps/bot/utils/loadGuildConfig.js`. It loads at startup and polls `updatedAt` every **15 s** (`:7,91-106`), storing a plain object in `guildConfigStore` (`apps/bot/utils/guildConfigStore.js:12,28-44`). Readers call `tryGetGuildConfig()`/`getGuildConfig()`.
- **References**:
  - **Roles are always referenced by key** (`commandPermissions`, `*RoleKeys`, `helperRoleKeys`) and resolved at runtime (`guildConfigStore.js:47-58,76-79`).
  - **Channels are mixed.** Functional channels are referenced by key (`getChannelId("modLog")` at `:60-74`; `confessions.modChannelKey`, `ranks.levelUpChannelKey`, `tasks.teams[].channelKey`). Newer features store raw IDs (`definitions.reviewChannelId`/`logChannelId` at `guildConfig.js:249-251`, `modmail.forumChannelId` at `:225`, `certificates.panel.channelId` at `:102`, and `{id,label}` lists for disabled channels at `:183-184,191-192`).
  - Exam papers store raw IDs. For v2, store **raw channel IDs with labels** (`IdLabel`, the same shape as `reputation.disabledChannels`) on a subject catalogue rather than adding dozens of subject channels to the functional `channels` key registry.
- **Categories registry** (`guildConfig.js:26-33,166`; `components/CategoryIdPicker.tsx`) is available if v2 wants "lock every channel in category X".

### 3.2 Definitions system as a subject catalogue
- **Config**: `packages/db/src/definitionsConfig.js`.
  - `DEFAULT_DEFINITION_SUBJECTS` (`:16-33`): 16 A-level subjects with slug IDs, e.g. `mathematics`, `further-mathematics`, `physics`.
  - `DEFAULT_DEFINITION_BOARDS` (`:35-40`): `caie`, `edexcel`, `aqa`, `ocr`.
  - Helpers: `slugifyEntryId` (`:74-82`) and `normalizeDefinitionsConfig` (`:129-172`), which checks unique slug IDs, labels and `enabled`.
- **Schema**: `DefinitionSubjectSchema {id, label, helperRoleKeys, enabled}` and `DefinitionBoardSchema {id, label, enabled}` (`guildConfig.js:127-145,246-255`).
- **Bot**: `apps/bot/utils/definitions.js:35-66,291-301` (lookup + autocomplete ranking); `apps/bot/systems/definitions.js` (buttons/modals).
- **Dashboard**: `settings/definitions/page.tsx` (437 lines) shows the whole pattern: draft + `normalizeDraft` + `AddEntryRow` with client-side `slugify` mirroring the server + reorder + enable toggles + `SaveActions` + `useUnsavedChanges`.
- **Reusability verdict**: the **subject identity** (stable slug ID + label + enabled + the "can't delete if in use" rule) is reusable. It lacks syllabus codes (e.g. `9709`), component/paper lists and a channel mapping.

  Do **not** overload `definitions.subjects` with exam fields. The definitions feature toggle, its approver semantics and the "in use by definitions" delete guard would couple two features. Instead, create an exam-subject catalogue (`examLocking.subjects` or an `ExamSubject` collection) keyed by syllabus code, with an optional `definitionSubjectId` link to reuse labels and helper roles. Copy the `normalize*Config` + slug + in-use-guard pattern.

### 3.3 Dashboard building blocks
- **Page shell**: `PageHeader` (+ `RestartBanner`) at `components/PageHeader.tsx:3-31`; `ConfirmModal` at `components/ConfirmModal.tsx` (`open/title/message/variant/onConfirm/onCancel`); `SaveActions` + `useUnsavedChanges`/`isDraftDirty` at `lib/unsaved-changes.tsx` (a navigation guard, **not auto-save**; there is no auto-save anywhere in `apps/web/src`); `sonner` toasts.
- **Pickers**:
  - `ChannelIdPicker` (`components/ChannelIdPicker.tsx:12-30`; `IdLabel[]` selection; `maxItems`; `removeConfirmMessage`) with `ChannelSearchMenu` (`:5,15-39`).
  - `RolePicker`/`RoleSelect`/`RoleSearchMenu`.
  - `CategoryIdPicker`/`CategorySearchMenu`.
  - `RolesSortableTable` (dnd-kit).
  - All pickers only offer entries from GuildConfig registries. The web cannot list live guild channels: it has no Discord REST calls apart from command registration (`packages/shared/src/commandPermissions.js:185`, `registerGuildCommands.js:142`).
- **Data hooks**: `useGuildConfig()` (`lib/useGuildConfig.ts:121-172`; `save(patch)` → `PUT /api/config`, with the status message "bot will apply within about 15 seconds"). `useOpsCollection()` (`lib/useOpsCollection.ts`) plus a generic `api/ops/[collection]` CRUD with a `MODEL_MAP` whitelist (`api/ops/[collection]/route.ts:9-78`). Neither of those filters by guildId (single-guild assumption).
- **Page categories**: Settings pages (GuildConfig, draft/save) vs. Operations pages (collections, immediate actions). v2 naturally splits into Settings → Exam locking (zones, subjects→channels, buffers, lock mode, feature toggle) and Operations → Exam timetable (series, papers, live status).

### 3.4 Web API authorization pattern
```ts
// every route handler (13 files)
const authResult = await requireAllowlistedAuth();          // lib/auth.ts:30-40
if (!authResult.authorized) return NextResponse.json(
  { error: authResult.status === 401 ? "Unauthorized" : "Forbidden" },
  { status: authResult.status });
const parsed = schema.safeParse(await request.json());       // zod v4
if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
const { Model } = await ensureDb();                           // lib/db.ts:47-87
const guildId = process.env.GUILD_ID;                         // 500 if missing
```
There are no roles, scopes or CSRF tokens beyond Clerk session cookies. `export const dynamic = "force-dynamic"` appears on every route. `authResult.email` is available for audit fields but unused.

### 3.5 Scheduling conventions in `apps/bot/systems`
| System | Mechanism | Notes |
|---|---|---|
| `utils/pollSweeper.js` | Adaptive `setTimeout` to the next deadline, capped at 5 min; 10 s startup; `wakePollSweeper()` called in-process by `/poll` (`poll.js:196`) | **Persists status before Discord work** (`:38-42`). This is the template examLock copied, minus that ordering. |
| `systems/examLockSystem.js` | Same pattern, 60 s cap | see §1.4 |
| `systems/qotd.js` | `setInterval` 5 min + IST hour check + "sent today" marker; checks `features.qotd` and `client.isReady()` (`:15,27-33`) | fixed IST +5:30 (`utils/qotdHelpers.js:16-29`) |
| `systems/certReminders.js`, `certForfeitSweeper.js` | 5 min interval + IST hour + `forfeitAt <= now`; feature and ready checks (`certForfeitSweeper.js:17,47-58`) | |
| mod-point expiry | **No scheduler.** `expiresAt` is stored per entry and filtered at read time (`utils/modPoints.js:52-55`); one-shot `backfillExpiry()` at startup (`:248-270`, `index.js:49-52`) | a "derive at read time" pattern |
| `xpFlushSystem` | 90 s interval + Redis `SET NX EX` lock | the only cross-process lock in the repo |

There is no cron library and no timezone library. Node 20 (`Dockerfile`: `node:20-bookworm-slim`) ships full ICU, so `Intl.DateTimeFormat(…, {timeZone: "Europe/London"})` works for IANA conversions without a dependency. Any new helper must be pure JS, and should live in `packages/shared` or a mongoose-free module if the client page needs it for previews. `packages/db` pulls in mongoose.

### 3.6 verify-*.js testing convention
- Each script is a plain Node script: `require("../loadEnv")`, a local `assert()`, a `main()` with `process.exit`. It is registered as `verify:<name>` in `apps/bot/package.json` and listed in `docs/setup.md:236-243`.
- Older scripts hit the real `MONGO_URI` with sentinel IDs and cleanup (`verify-poll-sweeper.js:14-16,78-82`) and use mock Discord clients (`:63-76`).
- Newer scripts (`verify-definitions.js:34-56`, `verify-mod-points.js:106+`) use **pure stubs**: `withStubs([[Model, "findOne", fn]])` and a `query()` thenable. They need no DB and no Discord. That is the convention to follow for v2.
- One source-inspection test exists (`verify-poll-sweeper.js:25-38`, asserting that no `setInterval` is used).

### 3.7 Single-guild or multi-guild?
**Single-guild.**
- `GUILD_ID` env is required everywhere: `loadGuildConfig.js:39-42`, `guildConfigStore.js:12` (one process-wide config), `commandSyncServer.js:17`, `apps/web/src/lib/db.ts:91` and all exam routes.
- Commands are registered to one guild (`docs/architecture.md:271`).
- The generic ops API and several bot sweepers don't filter by guild.
- `ExamSession`/`ExamPaper` carry `guildId`, but only the web uses it.

### 3.8 Redis and signalling
- Redis is required by the bot (`apps/bot/redis.js`; `docs/deployment.md:61` says "the bot crashes without REDIS_URL").
- It runs as a Coolify service on the bot's internal network.
- It is used only for XP counters and the flush lock.
- The web has no Redis client and no `REDIS_URL` (`.env.example` lists `REDIS_URL` under "Bot-only secrets"; `docs/environment-variables.md:13`).
- The existing web→bot path is the **HTTP sync server** (§1.9). Mongo is Atlas, a replica set, so change streams and transactions are technically available but unused.
- For v2 wake-ups, the least new infrastructure is:
  - add `POST /internal/exam-lock/wake` to `commandSyncServer.js`, reusing the same bearer secret, called best-effort from the exam routes;
  - keep the ≤60 s poll as the fallback;
  - use a timing-safe compare for the secret, because the current `!==` check at `:68-70` is not.

### 3.9 Deployment model
- Coolify runs **two Docker services**: `Dockerfile` (bot, `node apps/bot/index.js`) and `Dockerfile.web` (Next standalone). Redis is a Coolify service and Mongo is Atlas (`docs/deployment.md:7-32`).
- `docker-compose.dev.yml` only runs Redis locally.
- The bot is explicitly **single-instance** (`docs/deployment.md:289-295`), but nothing enforces it (see H4).
- Env is loaded from the repo-root `.env` locally (`apps/bot/loadEnv.js`) and injected by Coolify in production.

---

## 4. Gap analysis and recommendation

### 4.1 Requirement vs. v1

| Requirement | v1 | Gap |
|---|---|---|
| 3 series per year (Feb/Mar, May/Jun, Oct/Nov) | `ExamSession` is a free-named container; archive is cosmetic | No season/year fields. No per-series zone timings. Archive semantics missing. |
| 6 administrative zones with different sitting times | One AM and one PM UTC pair per session | **Missing entirely.** |
| A paper sat in several zones → one lock window spanning them | Paper = one date + one slot | **Missing.** Needs `sittings[]` per zone and a hull (earliest start − buffer → latest end + buffer). A hull, not per-zone gaps, is the right anti-leak semantics: once zone A has finished, zone B must not get the paper before it sits. |
| Times as published (local per zone) and DST-correct | UTC strings; admin converts by hand | Missing. Needs IANA tz per zone and per-date conversion. |
| Windows crossing 00:00 UTC | Impossible (same-date combine + end > start) | Must compute absolute instants. |
| Admin-entered timetable, efficiently | One paper per form submit; channels picked every time; free-text label | No subject catalogue, no syllabus/component model, no bulk entry (paste or CSV from the Cambridge timetable), no preview. |
| Subject → channels mapping | None (channels per paper; registry is the functional `channels` list or raw IDs) | Needs a catalogue: subject/syllabus → `IdLabel[]` channels, optionally subject role keys. |
| Flexibility (per-paper time override, buffers, variants, durations, clashes) | None | Needs a custom start/end per sitting, global and per-paper buffers, and optional component/variant fields. |
| A lock that actually works and restores cleanly | @everyone SendMessages only; null on unlock | H1/H2: snapshot and restore, role overwrites, threads. |
| Operability (who did what, is it locked now, failures) | Console + per-channel ModLog; no dashboard attribution; `/lock-status` blind | Audit fields, per-channel results, holder-aware `/lock-status`, feature flag. |

### 4.2 Options

**A. Extend v1 in place**: add `zones[]` to ExamSession and `sittings[]` to ExamPaper, and relax `date`/`slot`.
- Pros: fewest files; keeps collections and routes; the sweeper is untouched.
- Cons:
  - `ExamSession`'s 4 required UTC fields and `ExamPaper.date`/`slot` (required, `examPaper.js:23-35`) become legacy baggage.
  - "Session" vs "series" naming confusion.
  - No home for the subject catalogue.
  - It still leaves H1–H4, which need new structure anyway (a per-channel lock state).

**B. New models plus a migration**, with a clean separation of *timetable* (what admins enter) from *lock windows* (what the bot executes) and *channel lock state* (what is actually applied in Discord).
- Pros: matches the domain; allows zone- and DST-aware compilation; fixes the race and restore problems structurally.
- Cons: more code, and a one-off migration.

### 4.3 Recommendation: B, but reuse v1's executor almost unchanged

The key observation: **the v1 sweeper only depends on `{guildId, status, lockAt, unlockAt, channelIds, forceUnlock, cancelAfterUnlock}`**. It does not care how those were derived. So:

1. **Timetable (new, the source of truth admins edit)**
   - `GuildConfig.examLocking` (settings, via the `migrateGuildConfigDocument` default), plus `features.examLocking`:
     - zone catalogue `[{key: "z1"…"z6", label, timezone: IANA, enabled}]`
     - default session times per zone (local `HH:mm`)
     - `lockBufferMin`/`unlockBufferMin`
     - lock mode (deny threads, deny on role overwrites, notice on/off)
     - notice templates (reuse `renderMessageTemplate` from `@ralevel/shared`)
     - log channel key (default `modLog`)
   - `ExamSubject` (collection, or `examLocking.subjects` in config): `{code: "9709", label, definitionSubjectId?, channels: IdLabel[], roleKeys?, enabled}`. Keep the definitions-style slug, normalize and in-use-guard conventions.
   - `ExamSeries` (replaces ExamSession): `{guildId, season: "FM"|"MJ"|"ON", year, name, status, zoneTimings: [{zoneKey, amStart, amEnd, pmStart, pmEnd}]}` in **local** time, copied from config defaults at creation so later config edits don't retro-shift a series.
   - `ExamPaper` (evolved in place, same collection): add `seriesId`, `subjectId`, `component`, `sittings: [{zoneKey, date, slot: "AM"|"PM"|"custom", startLocal?, endLocal?}]`, `channelIds` (resolved from the subject, overridable), `createdBy`/`updatedBy`, `rev`, `channelResults[]`. `lockAt`/`unlockAt` become the compiled hull across zones, computed by a pure `compileExamWindow(series, zones, paper, buffers)` in a mongoose-free shared module so the dashboard can preview it. Keep `date`/`slot` optional for legacy rows.

2. **Executor (kept from v1, hardened)**
   - Keep `examLockSystem.js`'s adaptive scheduler, `computeNextSweepDelay`, `getNextExamEventAt`, the status machine, the `forceUnlock`/`cancelAfterUnlock` command flags, `channelStillCovered` (generalised), `logExamAction`, and the notices.
   - Changes:
     - `guildId` filters (H4)
     - atomic claim `scheduled → locking → locked` (H3)
     - web writes conditional on status
     - error-safe reschedule with backoff (M2, M3)
     - `client.isReady()` + feature-flag check (L2, L3)
     - in-flight guard + `POST /internal/exam-lock/wake` on the sync server (M1)
     - `missed` status and per-channel results (M5)
     - one modLog embed per paper (M8)
     - Discord `<t:…>` timestamps in notices (H5)

3. **Channel lock state (new)**: `ChannelLock {guildId, channelId, holders: [{kind: "exam", paperId} | {kind: "manual", userId, reason}], snapshot: {everyone: {allow, deny}, roles: [{id, allow, deny}]}, appliedAt, lastVerifiedAt}`.
   - `channelLock.js` becomes `acquire(channel, holder)` / `release(channel, holder)`. The first acquire snapshots and applies the deny, including threads and role-allow overrides. The last release restores the snapshot exactly.
   - `/lock`, `/unlock` and a rewritten `/lock-status` use the same API. This fixes H1 and H2 and makes manual and exam locks compose.
   - Each sweep can also **reconcile** by comparing holders to actual overwrites (M7). That self-heals any orphan from crashes or races.

4. **Migration** (a `apps/bot/scripts/migrate-exam-v1-to-v2.js` in the style of `migrate-task-selected-to-array.js`):
   - For each ExamSession, create an ExamSeries with a single zone `legacy-utc` (timezone `UTC`) whose timings equal the old UTC times.
   - For each ExamPaper, set `seriesId` and `sittings: [{zoneKey: "legacy-utc", date, slot}]`. Keep status, `lockAt`/`unlockAt` and the flags as they are.
   - For papers currently `locked`, create `ChannelLock` holders **without** a snapshot (mark `snapshot: unknown` and restore to neutral, which is v1 behaviour).
   - Run `countDocuments` first. v1 shipped 2026-08-01, between series, so production likely holds few or only test records. If it holds none, skip the migration and drop the v1 session routes.

**Timing note:** the Oct/Nov 2026 series is imminent. If v2 isn't ready in time, v1 can be used as a stopgap:
- enter hull windows in UTC;
- split sessions at 2026-10-25 and 2026-11-01;
- avoid windows that cross midnight UTC;
- avoid concurrent dashboard edits near lock times (H3);
- **first verify on the live server that subject channels' role overwrites don't allow SendMessages** (H2).

### 4.4 What can be kept as-is

- `examLockSystem.js` structure:
  - adaptive scheduler (`:14-19,25-59,346-389`)
  - `processDueLocks`/`processDueUnlocks` batching (`:270-318`)
  - past-window skip (`:282-290`, but log it and mark it `missed`)
  - lock-before-unlock ordering (`:339-344`)
  - `logExamAction` ModLog + embed shape (`:89-156`)
- `channelStillCovered` semantics (`:64-87`). They move into the holder-set model, but the rule stays the same.
- ExamPaper status enum and the `forceUnlock`/`cancelAfterUnlock` flag protocol (`examPaper.js:54-76`), plus the `lockAt`/`unlockAt` indexes (`:81-84`). Add `{guildId, status, lockAt}` / `{guildId, status, unlockAt}`.
- Web: API route skeletons (auth, zod, `GUILD_ID` scoping, 409 rules in `[paperId]/route.ts:63-99,160-168` and `[id]/route.ts:196-209`), the `computePaperWindow`-in-`packages/db` idea (shared compile logic used by both web and bot), and the `db.ts`/`index.js`/`index.d.ts` export plumbing.
- Page structure: create → list → detail → actions with ConfirmModal, `readError` helper (`page.tsx:51-59`), `formatUtc`. Replace the paper form with a subject + sittings grid and add a local-time preview per zone.
- `verify-exam-lock.js` unit sections (`:84-244`). Port the live sections to the stub style of `verify-definitions.js`.

### 4.5 Verify before designing further (not checkable from the repo)

1. **Live server**: do subject channels have role overwrites that **allow** SendMessages? Are any exam-target channels forums? Do they use threads heavily? This decides the H2 lock mode.
2. **Production Mongo**: counts of `examsessions`/`exampapers` by status, and whether any dev or staging process shares the same `MONGO_URI` (H4).
3. **Production env**: are `SYNC_HTTP_PORT` + `INTERNAL_SYNC_SECRET` + `BOT_INTERNAL_SYNC_URL` configured (Option B)? That determines whether the wake endpoint is usable immediately.
4. **Cambridge data**: the authoritative zone list with IANA time zones and the per-zone session start times for each series. Is the same component ever sat on *different dates* in different zones? The model allows it through per-sitting dates, but the UI and preview should handle it.
5. **Product decision**: should a manual `/unlock` during an exam be allowed as an override? It currently is, silently. If yes, it should be recorded as a holder override.
