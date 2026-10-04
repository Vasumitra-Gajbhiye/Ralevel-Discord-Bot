# Exam channel-locking: Discord platform research

Research date: 2026-09-30. Scope: facts for the design doc on automatic exam-window channel locks.
Repo context read (read-only): `apps/bot/utils/channelLock.js`, `apps/bot/systems/examLockSystem.js`,
`apps/bot/commands/moderation/lock.js`, `unlock.js`, `packages/db/src/models/examPaper.js`.
Installed versions: discord.js **14.27.0**, @discordjs/rest **2.6.3**. (package.json says `^14.11.0`, so the lockfile resolves to 14.27.)

Note: discord.com/developers/docs now 301-redirects to **docs.discord.com/developers/...**. Raw sources are at
github.com/discord/discord-api-docs (`developers/**.mdx`). support.discord.com pages return 403 to plain fetches. Their
text was read through the Zendesk JSON API (`support.discord.com/api/v2/help_center/en-us/articles/<id>.json`).

---

## How v1 fails today (summary of what the research implies)

| v1 behaviour | Problem |
|---|---|
| Lock only sets `@everyone` `SendMessages=false` | Any **role overwrite that allows** SendMessages (e.g. a subject or Verified role overwrite) beats it. So does any member overwrite. Holders of those roles can still talk. See Q1. |
| Only `SendMessages` | Threads, forum replies, thread creation (thread titles leak) and reactions stay open. `SendMessages` has **no effect in threads**. See Q2. |
| Unlock sets `SendMessages=null` | Wipes any explicit allow or deny an admin had set on `@everyone` before the lock. See Q5. |
| Notice sent after lock | If the bot is **not Administrator**, the `@everyone` deny also removes the bot's own SendMessages. The bot's role has guild-level Send, but the channel `@everyone` deny strips it. The notice then fails with 50013, unless the bot's role or member has an allow overwrite. |
| `/lock` and exam lock share one bit, and `channelStillCovered` only looks at papers | A manual `/lock` during an exam is undone by the exam unlock. A manual `/unlock` mid-exam silently unlocks it. |
| `paper.status = "locked"` even if some channels failed (`continue`) | Nothing retries a failed channel. |
| `formatUnlockUtc` prints a UTC string | Use `<t:unix:F>` / `<t:unix:R>` instead (Q6). |

---

## 1. Permission resolution

**Primary source:** Permissions → "Permission Overwrites", "Permission Hierarchy", "Implicit Permissions"
- https://docs.discord.com/developers/topics/permissions
- raw: https://github.com/discord/discord-api-docs/blob/main/developers/topics/permissions.mdx

Official order:
1. Base permissions = `@everyone` role perms OR'd with **all** the member's role perms (guild level). If this includes `ADMINISTRATOR`, the result is ALL and overwrites are ignored.
2. Channel `@everyone` overwrite: `perms &= ~deny; perms |= allow`.
3. **All role overwrites for roles the member has, combined:** OR all their denies together and all their allows together. Then apply `perms &= ~denyUnion; perms |= allowUnion`. **Allows are applied after denies, so any allowing role wins over any denying role, whatever the role positions.**
4. Member overwrite: `perms &= ~deny; perms |= allow`.

Official pseudocode (`compute_overwrites`) is in the doc above. discord.js `GuildChannel#memberPermissions` implements the same thing, and also returns ALL for the **guild owner** and for Administrator.
Source: https://github.com/discordjs/discord.js/blob/v14/packages/discord.js/src/structures/GuildChannel.js

Docs quote: *"permissions do not obey the role hierarchy. For example, a user has two roles: A and B. A denies VIEW_CHANNEL on #coolstuff. B allows VIEW_CHANNEL on the same channel. The user would ultimately be able to view #coolstuff, regardless of the role positions."*
discord.js guide quote: *"All additional roles allow overwrites are applied after all additional roles denies! If any of a member's roles have an overwrite to allow a permission explicitly, the member can execute the associated actions in this channel regardless of the role hierarchy."*
Source: https://discordjs.guide/popular-topics/permissions-extended

### Worked cases for "@everyone deny SendMessages" (the v1 lock)

| Setup | Can the member talk while "locked"? |
|---|---|
| "Verified" role grants SendMessages **at guild level**, and has no channel overwrite | **No.** The channel `@everyone` deny strips the bit from the combined base (step 2 applies to the full base). |
| "Physics" role has a **channel overwrite allowing** SendMessages | **Yes.** Step 3 re-adds it. **The lock is bypassed for everyone holding Physics.** |
| "Physics" overwrite allows only ViewChannel (the usual opt-in pattern) | No |
| Member-specific overwrite allowing SendMessages (e.g. a helper given personal access) | **Yes** (step 4) |
| Member has Administrator, or is the guild owner | **Yes**, always. Overwrites don't apply. |
| Moderator role (ManageMessages, ManageChannels, BanMembers, etc., but no Admin) with no overwrite | **No.** Only Administrator bypasses overwrites. ManageChannels, ManageMessages and ManageThreads do not grant SendMessages. |
| Moderator role with ManageRoles in the channel | Cannot talk, but **can edit the overwrites and undo the lock** |
| A dedicated "Exam Lock" role with a deny, while the member also has a role whose overwrite allows | **Yes.** A role allow beats a role deny. |
| Timed-out member | Can't talk anyway (timeouts remove everything except View/ReadHistory; Admins are exempt) |

**What this means for an @everyone-only lock:** it is correct only if **no role or member overwrite on that channel allows any of the locked bits**. You cannot assume that on a big server with subject roles, helper roles and legacy overwrites. You must inspect every overwrite on the channel.

### Robust "everyone except staff" lock

For each locked channel, using a freshly fetched overwrite list:
1. `@everyone`: add the lock mask to **deny** and remove it from **allow**.
2. Every **non-staff role overwrite** whose `allow` intersects the mask: **remove those bits from allow** (neutralise). A deny is not needed: once the allow is gone, the `@everyone` deny holds. Adding denies is only extra churn. It also risks locking out staff who hold the role, although a staff allow would still win.
3. Every **non-staff member overwrite** whose `allow` intersects the mask: same neutralisation.
4. **Staff roles** (a configured "exam-lock bypass" list): add the mask to allow. Otherwise non-Admin mods are locked out too.
5. **The bot itself**, if it isn't Administrator: an allow overwrite for at least ViewChannel, SendMessages and EmbedLinks on its member id or managed role, so the notice can be posted.

### Alternatives evaluated

| Approach | Verdict |
|---|---|
| **A. `@everyone` deny only (v1)** | Broken whenever any role or member overwrite allows. Simple, but not safe. |
| **B. `@everyone` deny + neutralise non-staff allows + staff allow (above)** | **Recommended.** Robust. Needs a snapshot for exact restore. Costs about 1–6 PUTs per channel. |
| **C. Dedicated "Exam Lock" role with a deny overwrite** (zombbblob's pattern, see Q8) | Restore is trivial: delete the one overwrite, and no admin settings are touched. **But** every member needs the role, which means mass role-adds on a big server, and **any other role's allow still beats it**. It only works if an audit shows no allowing role overwrites. At that point B is just as simple. It is also a poor fit because it doesn't cover members without the role. |
| **D. Remove SendMessages from `@everyone`/Verified at guild level** | One request, but it affects the **whole server**, not per channel. Channel role allows still beat it. It's a "server lockdown", not an exam lock. |
| **E. Hide the channel (`ViewChannel` deny)** | Strongest: it implicitly denies everything, hides all threads, and blocks reading. **But** the channel vanishes from the sidebar, which confuses people, and history needed for revision disappears. The lock notice can't be read in-channel. Voice users already connected are unaffected (see Q2). Role overwrites that allow ViewChannel (typical opt-in subject roles) still beat an `@everyone` deny, so you need the same neutralisation as B. Only worth it for channels that should be invisible during the window, such as a per-paper "post-exam discussion" channel that is revealed at unlock (a nice inverse pattern). |
| **F. Move channel into a "Locked" category with `lock_permissions`** | One PATCH per channel, but it **replaces the whole overwrite set** and re-orders the channel list. Restoring needs the full snapshot plus a move back. Not recommended. |
| **G. Replace the full overwrite set atomically with one PATCH (`permissionOverwrites.set`)** | One request per channel and atomic. **But** it rewrites every target: last writer wins against any admin edit made between read and write. It needs ManageChannels as well as ManageRoles, and it shares the `PATCH /channels/{id}` route with name and topic edits. Per-target PUT limits the blast radius, so prefer B with per-target PUTs. |

---

## 2. Which permissions to deny

Permission table (flags, descriptions, and T/V/S applicability): https://docs.discord.com/developers/topics/permissions

Key facts (quoted from the docs):
- `SEND_MESSAGES` (1<<11): *"Allows for sending messages in a channel and creating threads in a forum (does not allow sending messages in threads)"*.
- `SEND_MESSAGES_IN_THREADS` (1<<38): threads only. Threads doc: *"The SEND_MESSAGES permission has no effect in threads; users must have SEND_MESSAGES_IN_THREADS to talk in a thread."* https://docs.discord.com/developers/topics/threads
- `CREATE_PUBLIC_THREADS` (1<<35) and `CREATE_PRIVATE_THREADS` (1<<36). **Thread names are a leak vector** even when nobody can post inside.
- `ADD_REACTIONS` (1<<6): *"Allows for adding new reactions… This permission does not apply to reacting with an existing reaction on a message."* So people can still click reactions that already exist.
- Implicit: *"Denying SEND_MESSAGES implicitly denies MENTION_EVERYONE, SEND_TTS_MESSAGES, ATTACH_FILES, and EMBED_LINKS."* Polls and voice messages are messages, so a SendMessages deny also blocks them in the channel. `SEND_POLLS` (1<<49), `SEND_VOICE_MESSAGES` (1<<46) and `ATTACH_FILES` are redundant once SendMessages (and SendMessagesInThreads for threads) are denied.
- **Slash and context-menu commands need SEND_MESSAGES too.** Discord staff (DV8FromTheWorld, 2022-09-28): *"The behavior of requiring SEND_MESSAGES as well as USE_APPLICATION_COMMANDS to be able to use commands (slash, context, etc) is an intentional choice."* **Buttons and selects on existing bot messages still work.** https://github.com/discord/discord-api-docs/discussions/5097. So `USE_APPLICATION_COMMANDS` is redundant for the channel itself.
- `USE_EXTERNAL_APPS` (1<<50): user-installed apps' responses become ephemeral when it is denied. Mostly redundant given the above. Cheap to include if the bot is Admin.
- Voice: `CONNECT` (1<<20), `SPEAK` (1<<21), `STREAM` (1<<9), `USE_SOUNDBOARD` (1<<42), `USE_EMBEDDED_ACTIVITIES` (1<<39), `SET_VOICE_CHANNEL_STATUS` (1<<48, documented 2026-04-20; the status text is a small leak vector), and `SEND_MESSAGES` for text-in-voice. Stage: `REQUEST_TO_SPEAK` (1<<32).

### Forum and media channels
- Creating a **post** = `SEND_MESSAGES`. `CREATE_PUBLIC_THREADS` is ignored there. Threads doc: *"creating a thread in a thread-only channel only requires the SEND_MESSAGES permission."* Channel doc (Start Thread in Forum or Media Channel) says the same.
- **Replying inside a post** = `SEND_MESSAGES_IN_THREADS`. Reacting = `ADD_REACTIONS`.
- *"Messages cannot be sent directly in forum channels."* Media channels (type 16) behave like forums and are still marked beta.
- Forum lock mask: `SendMessages | SendMessagesInThreads | AddReactions` (the CreateThreads bits are harmless to include).

### Do parent overwrites apply to existing threads?
Yes. Threads have no overwrites of their own. *"Threads inherit permissions from the parent channel … with one exception: The SEND_MESSAGES permission is not inherited."* (Permissions → Inherited Permissions (Threads)). So a `SendMessagesInThreads` deny on the parent takes effect immediately in **every** existing public thread, private thread and forum post. Private-thread members need the parent permission too.

### Should we also lock or archive threads?
Not needed to stop posting. Reasons against doing it by default:
- It costs one PATCH per active thread, and forums can have hundreds.
- It needs `MANAGE_THREADS`.
- You would have to track which threads were already mod-locked or archived, so unlock doesn't reopen them.
- Archived threads must be unarchived first. r-IGCSE hit exactly this (PR #239). Only active threads can be changed.

Locked-thread semantics, for reference: *"Users … without MANAGE_THREADS … won't be able to create or update messages in locked threads, or update properties like its title or tags."* *"Sending a message will automatically unarchive the thread, unless the thread has been locked by a moderator."* A locked thread also blocks **edits**. Whether a channel-level SendMessages deny blocks editing your own old messages is **unverified** (see the Unverified section). Recommendation: rely on parent overwrites. Only offer per-thread `locked=true` for a thread that is explicitly the target, and track its prior `locked`/`archived` state.

### Announcement channels
Members usually lack SendMessages there already. They often have `SendMessagesInThreads` / `CreatePublicThreads` ("announcement threads") and `AddReactions`, so apply the same text mask. Webhook-posted and cross-posted messages ignore member permissions (not a member leak vector).

### Voice and stage
- **Denying CONNECT does not kick people who are already connected.** A community report (2021) says overwrite changes on voice channels only took effect on reconnect: https://support.discord.com/hc/en-us/community/posts/1500000430241-Voice-Channel-Permission-Updates (a user report, not official; re-test).
- To truly lock a voice channel you must also **disconnect** current non-staff members: `PATCH /guilds/{id}/members/{uid}` with `channel_id: null`, which needs `MOVE_MEMBERS` (Guild resource → Modify Guild Member). That is one request per member, all in one guild-scoped bucket.
- Voice mask: `Connect | Speak | Stream | SendMessages | AddReactions | UseSoundboard | UseEmbeddedActivities (| SetVoiceChannelStatus)`. Stage: add `RequestToSpeak`.

### Recommended masks (discord.js `PermissionFlagsBits` names)
- **Text / Announcement:** `SendMessages, SendMessagesInThreads, CreatePublicThreads, CreatePrivateThreads, AddReactions` (optionally `UseExternalApps`)
- **Forum / Media:** `SendMessages, SendMessagesInThreads, AddReactions` (+ the two CreateThreads bits, harmless)
- **Voice:** `Connect, Speak, Stream, SendMessages, AddReactions, UseSoundboard, UseEmbeddedActivities`, plus disconnecting current members
- **Stage:** the Voice mask + `RequestToSpeak`
- Do **not** touch `ViewChannel` or `ReadMessageHistory`.

---

## 3. Overwrite edit mechanics and required permissions

**Edit Channel Permissions** `PUT /channels/{channel.id}/permissions/{overwrite.id}`. Raw docs: https://github.com/discord/discord-api-docs/blob/main/developers/resources/channel.mdx
- *"Requires the MANAGE_ROLES permission. Only permissions your bot has in the guild or parent channel (if applicable) can be allowed/denied (unless your bot has a MANAGE_ROLES overwrite in the channel)."* Body: `{type: 0|1, allow, deny}`. Returns 204. Supports `X-Audit-Log-Reason`. Fires CHANNEL_UPDATE.
- **The PUT replaces that target's whole allow/deny.** There is no per-bit patch, so every edit is read-modify-write.
- **Delete Channel Permission** `DELETE /channels/{id}/permissions/{overwrite_id}`: needs MANAGE_ROLES, supports audit reason.
- **Modify Channel** `PATCH /channels/{id}`: needs **MANAGE_CHANNELS**. *"If modifying permission overwrites, the MANAGE_ROLES permission is required."* Same "only permissions your bot has" rule. *"If modifying a category, individual Channel Update events will fire for each child channel that also changes."*

**Can a bot set bits it doesn't have?** No, unless it has an explicit `ManageRoles` **overwrite** in that channel (a guild-level ManageRoles doesn't count for this escape hatch). Discord clarified that "channel" means the **parent category** channel: https://github.com/discord/discord-api-docs/issues/3450 (closed 2022, docs fixed).
- discord.js guide: the bot cannot create a channel or overwrite **that includes the ManageRoles flag** unless it has Administrator or an explicit ManageRoles overwrite on the channel. https://discordjs.guide/popular-topics/permissions-extended
- ⇒ Simplest: give the bot **Administrator**. Otherwise make sure its role has every bit in the mask at guild level and ManageRoles in each channel. For full flexibility, add an explicit ManageRoles allow overwrite for the bot on the relevant categories or channels.

**Role hierarchy:** it does **not** constrain channel overwrites. The discord.js guide says the bot *"can manage overwrites for roles or users with higher roles than its own highest role."* Hierarchy only matters for editing role objects, assigning roles, kick/ban, and nicknames.

**2FA:** MANAGE_ROLES, MANAGE_CHANNELS, MANAGE_THREADS and MANAGE_MESSAGES carry the footnote *"require the owner account to use two-factor authentication when used on a guild that has server-wide 2FA enabled."* For a bot, the owner is the **application or team owner's account**. Without it you get error `60003`.

**Category sync** (Permissions → Permission Syncing, official): *"If a child channel has the same permissions and overwrites (or lack thereof) as its parent category, the channel is considered "synced"… Any further changes to a parent category will be reflected in its synced child channels. Any further changes to a child channel will cause it to become de-synced."*
- Sync is **equality-based**, not a stored flag.
  - Editing a child de-syncs it.
  - Restoring it **exactly** re-syncs it.
  - An **empty `allow=0/deny=0` overwrite left behind** for a target the category doesn't have breaks equality. discord.js `permissionsLocked` treats an empty `@everyone` specially but not other targets. So **DELETE overwrites you created**; don't leave them empty.
- Editing the **category** propagates to synced children only. **Unsynced children are silently not locked.**
- Help Center, "Channel Categories 101" (read via the Zendesk API): *"If you change the permissions on a category, all channels that are synced will automatically update… Changing a category's permissions will change all synced channel's permissions, but not the permissions of any not-synced channel!"* https://support.discord.com/hc/en-us/articles/115001580171
- Contrary data point: Rapptz (discord.py, 2021) said sync is "mostly a visual client-side indicator": https://github.com/Rapptz/discord.py/discussions/6888. The official docs and the CHANNEL_UPDATE-per-child note point to server-side propagation. **Verify on a test server** (listed under Unverified).
- `lock_permissions` exists on Modify Guild Channel Positions and PATCH channel with `parent_id`: *"syncs the permission overwrites with the new parent, if moving to a category"*. discord.js `channel.lockPermissions()` copies the parent's cached overwrites through PATCH.

**Category-level vs channel-level lock:** use **channel level**.
- A category usually contains several subjects plus resource and voice channels.
- Unsynced children get skipped silently.
- Worst case: if an admin edits a child during a category-level lock, that child **de-syncs with the lock baked in**, and restoring the category never unlocks it.
- In the dashboard, "lock category X" can be a convenience that **expands to channel IDs at lock time**. Store the expanded list.

**discord.js v14 API** (source read: `PermissionOverwriteManager.js`, `PermissionOverwrites.js`, v14 branch):
- `permissionOverwrites.edit(target, options, { reason, type })`: **merges with the *cached* overwrite** (`true` → allow, `false` → deny, `null` → clear), then PUTs the full result. If the cache is stale you clobber other bits. Note the **third argument is an object**, so `edit(t, opts, "reason")` silently drops the reason.
- `permissionOverwrites.create(target, options, { reason, type })`: PUT **starting from zero**, so it **replaces** the target's whole overwrite with only the listed bits. Dangerous for our use.
- `permissionOverwrites.set(array, reason)`: `channel.edit({ permissionOverwrites })`, i.e. PATCH replacing **all** targets.
- `permissionOverwrites.delete(target, reason)`: reason is a string here.
- The most precise option is to compute exact bitfields and call `client.rest.put(Routes.channelPermission(chId, targetId), { body: { type, allow: String(allow), deny: String(deny) }, reason })`.
- `channel.edit()` only sends the fields you pass, because undefined values are dropped from the JSON. So a permissions-only PATCH doesn't touch name or topic.

---

## 4. Rate limits

Official: https://docs.discord.com/developers/topics/rate-limits
- **Global: 50 requests/second per bot.** Interaction endpoints are exempt.
- **Per-route buckets are keyed by the major parameter** (`channel_id`, `guild_id`, `webhook_id`). *"If you exceeded a rate limit when calling one endpoint /channels/1234, you could still call … /channels/9876 without a problem."* So each channel's PUT-permission bucket is independent.
- Limits are **not documented per route**. Read them from `X-RateLimit-Limit/Remaining/Reset-After/Bucket/Scope`, and don't hard-code them.
- **Invalid-request limit: 10,000 per 10 minutes** (401/403/429) leads to a temporary Cloudflare IP ban (userdoccers says 24 h). `429`s with `X-RateLimit-Scope: shared` don't count. **Avoid repeated 403s** (e.g. retrying a channel where the bot lacks ManageRoles every sweep).
- Bot owners at scale can request 1,200 rps via https://dis.gd/rate-limit (userdoccers).

**Name and topic limit:** undocumented but long-standing. From https://github.com/discord/discord-api-docs/issues/2190 (and #1900):
- Name change: **2 per 10 minutes** per channel. Topic change: 2 per 10 minutes. Name and/or topic combined: 2 per 10 minutes.
- Other PATCH changes: about 10 per 15 s.
- These apply to **PATCH /channels/{id} bodies that contain `name` or `topic`**. **Permission overwrite PUTs (`/channels/{id}/permissions/{id}`) are a different route and do not hit this limit.** A permissions-only PATCH also isn't in the name/topic sub-bucket.
- @discordjs/rest 2.6.3 (installed) has explicit **sublimit** handling. `hasSublimit()` returns true only for `PATCH /channels/:id` with `name` or `topic` in the body. After a sublimit 429, those requests go to a separate queue, so other requests on the same bucket are not blocked. **The rename promise itself will just sit pending for about 10 minutes.** Historically this looked like "channel.edit() never resolves": https://github.com/discordjs/discord.js/issues/4330
- Error codes: `20028` *"The write action you are performing on the channel has hit the write rate limit"*, `30060` *max overwrites per channel (1000)*, `30013` *max guild channels (500)*. https://docs.discord.com/developers/topics/opcodes-and-status-codes

**Budget for 20–40 channels with 3–5 overwrites each:**
- Lock PUTs per channel = 1 (`@everyone`) + roles to neutralise (often 0–3) + staff allows (1–2, only when missing) + bot allow (0–1). That is about **2–6 per channel, so ~80–240 PUTs**, plus 20–40 notice POSTs (a separate per-channel message bucket). Worst case is about 280 requests.
- At the 50 rps global cap that is at least 6 s. In practice latency dominates: sequential at 150 ms is about 40 s; with 5–10 channels in parallel it is about 5–10 s.
- Every PUT emits a CHANNEL_UPDATE gateway event, which is harmless.
- **discord.js defaults** (`@discordjs/rest` DefaultRestOptions): `globalRequestsPerSecond: 50`, `rejectOnRateLimit: false` (queue and wait), `retries: 3`, `timeout: 15_000` ms per HTTP attempt. So the queue handles this comfortably.
- Recommendations:
  - Run channels in parallel with a small pool (5–10), and targets sequentially within a channel.
  - Subscribe to `client.rest.on("rateLimited", …)` for logging.
  - **Never put channel renames on the lock's critical path.**
- Lock the slot's channels a minute early (e.g. `lockAt − 60 s`) so the tail finishes before the paper starts. Also sort by priority.

---

## 5. Safe restore

**Why `null` on unlock is dangerous:** it erases pre-existing state.
- If `@everyone` had an explicit **deny** before (a read-only channel), unlock **opens** it.
- If it had an explicit **allow** (to override a guild-level restriction), unlock turns it into "inherit", which may lock it permanently.
- A synced child that gets an empty overwrite never re-syncs.
- r-IGCSE's bot has the same bug (Q8).

### Recommended design: lease + snapshot + 3-way merge, driven by a reconciler

**Data model** (new collection, e.g. `ChannelLock`, unique on `{guildId, channelId}`):
```
{
  guildId, channelId, channelType,
  holders: [ {kind: "exam", paperId, until: Date}, {kind: "manual", actionId, by, reason, until?: Date} ],
  status: "locking" | "locked" | "unlocking" | "unlocked",
  mask: "<bigint string>",
  wasSynced: Boolean, parentId, parentOverwritesHash,   // captured at first lock
  snapshot: [ {targetId, type, existed: Boolean, allow: "<bigint>", deny: "<bigint>"} ], // FULL prior bitfields
  applied:  [ {targetId, type, allow, deny} ],            // exactly what we wrote
  notice: {messageId}, lastError, version
}
```

**Lock (0 → 1 holders):**
1. Atomically `findOneAndUpdate` to add the holder and set `status: "locking"` **only if no snapshot exists**.
2. Fetch the channel fresh (`client.channels.fetch(id, { force: true })`).
3. **Persist the snapshot before any Discord write** (write-ahead).
4. Compute `applied` using the Q1 rules.
5. PUT each target where `current != applied`.
6. Set `status: "locked"` and post the notice.

A later holder (a second paper, or a manual `/lock`) only does `$addToSet` on holders. **It never re-snapshots.** Re-snapshotting after a partial lock would capture our own deny as the "original", which is the classic bug.

**Unlock (1 → 0 holders):**
- Remove the holder. Only when `holders` is empty: set `status: "unlocking"`, then restore each target in `snapshot ∪ applied`. For each **bit in the mask** only, with tri-state per bit ∈ {allow, deny, neutral}:
  - `cur == ours` → set to `base` (the snapshot).
  - `cur != ours` → **leave it.** An admin changed it during the lock (drift). Log it to mod-log.
  - Bits outside the mask are never touched. They keep `cur`, so an admin's unrelated edits during the lock survive.
- Then:
  - If the result is `allow=0 & deny=0` and `!existed`, **DELETE** the overwrite (keeps category sync).
  - If `wasSynced` and there was no drift, compare with the parent. If the parent's overwrites changed during the lock (hash differs), call `channel.lockPermissions()` so category edits made during the lock are picked up.
  - Set `status: "unlocked"` and clear the snapshot.

**Overlaps:**
- Two papers on one channel = two holders, so one snapshot and one restore. There is no flapping between consecutive windows, which also avoids the name-edit budget if renames are ever used.
- Replace `channelStillCovered()` with the holder set.

**Manual `/lock` during an exam:** add a `manual` holder. The exam unlock removes only its own holder, so the channel stays locked.

**Manual `/unlock` during an exam:**
- Remove the `manual` holder. If exam holders remain, reply "still exam-locked until `<t:…:R>`".
- Offer `/unlock force:true`, which clears all holders and marks the paper-channel pair `forceUnlocked` so the reconciler doesn't re-lock it.

**Crash safety:**
- `locking` / `unlocking` are resumable. The reconciler on startup re-runs the step, and both steps are idempotent because they compare against the stored `applied` and `snapshot`, not against live state as the baseline.
- Restoring a target that was already restored: `cur == base`, which is not equal to `ours`, so it is left alone. That is correct.

**Reconciler** (runs every sweep, at exact boundary times via the existing `setTimeout` scheduler, and debounced on `channelUpdate` for managed channels):
- `desired(channel) = any holder active at now` (exam windows from `ExamPaper` plus manual holders).
- Desired locked, no lease → lock.
- Desired locked, lease exists → **verify effective state**. Check every non-staff role overwrite, member overwrite and `@everyone` for allowed mask bits. discord.js `channel.permissionsFor(role)` works for roles. If someone or something re-opened it (an admin edit, a new role overwrite), re-apply. For a **new** target, add its current state to the snapshot as that target's base.
- Not desired, lease exists → unlock.
- This also covers downtime at the boundary, partial failures (v1 marks the paper locked even when channels fail), and deleted channels (drop the lease).
- **Beware loops:** your own PUTs fire `channelUpdate`. Treat "already matches desired" as a no-op.
- If admins disagree with the reconciler, the only override should be `force` (don't fight the UI silently). Log every correction.

**Pre-flight audit (dashboard):** for each configured channel, show:
- overwrites that allow mask bits (roles and members)
- whether the bot has ManageRoles and every mask bit (else 50013)
- synced status
- channel type
- whether the bot is Admin
- whether the owner has 2FA (if 60003 is seen)

Run it when a session is created, not at lock time.

---

## 6. UX

**Timestamps** (Reference → Message Formatting): `<t:UNIX>` / `<t:UNIX:STYLE>`, **seconds**. They are *"display[ed] … in the user's timezone and locale."* https://docs.discord.com/developers/reference
- Styles: `t` 16:20 · `T` 16:20:30 · `d` 20/04/2021 · `D` April 20, 2021 · `f` (default) April 20, 2021 at 16:20 · `F` Tuesday, April 20, 2021 at 16:20 · `s` 20/04/2021, 16:20 · `S` 20/04/2021, 16:20:30 · `R` "in 2 hours" (updates live).
- Use `Locked for **9702/42** until <t:1747389600:F> (<t:1747389600:R>)` in the **embed description or field values**, or a Components v2 TextDisplay.
- Not in embed title or footer. Discord said *"Embeds will not be getting new features"* when asked for footer timestamps, and recommends Components v2 or `-#` subtext: https://github.com/discord/discord-api-docs/discussions/3777. The embed `timestamp` field does render localised in the footer.
- `Math.floor(date.getTime()/1000)`.

**Channel name or topic as a lock indicator:** 2 edits per 10 min per channel (Q4). Lock plus unlock uses the whole budget, so a re-lock within 10 min hangs for about 10 min (the discord.js sublimit queue). Renames also confuse search and muscle memory. Recommendation: **don't rename**. If you want a topic banner, make it best-effort, fire-and-forget with its own timeout, and never block locking on it. Whether `<t:…>` renders inside channel topics is unverified.

**Pinned or sticky notices:**
- "Sticky" isn't needed: nobody except staff can post in a locked channel, so **the lock notice stays the latest message**.
- Pinning needs `PIN_MESSAGES` (1<<51). It was split from MANAGE_MESSAGES and has been **mandatory since 2026-02-23** (changelog 2025-11-24, https://docs.discord.com/developers/change-log). The pin limit was raised to 250 per channel (Aug 2025 patch notes). Pinning posts a system message, which is noise.
- On unlock, **edit** the notice to "Unlocked at `<t:…:t>`" or delete it, instead of posting a second message. That means fewer pings and a cleaner channel. Store `notice.messageId` on the lease.

**Scheduled events as an exam calendar** (https://docs.discord.com/developers/resources/guild-scheduled-event):
- `EXTERNAL` events need `entity_metadata.location` and `scheduled_end_time`.
- They **auto-start at the start time and auto-complete at the end time** (docs: "An external event will automatically begin/end…").
- Cap: *"maximum of 100 events with SCHEDULED or ACTIVE status."* Description 1–1000 characters.
- Needs `CREATE_EVENTS` (mandatory since 2026-02-23). Editing others' events needs `MANAGE_EVENTS`.
- Members can click "Interested" and get notified.
- Pattern: one event per **slot** (e.g. "Exam lock: 12 May AM, 9702/42 · 9709/12 · …"), created on a rolling 7–14 day horizon to stay under 100. Pros: native, local times, visible calendar. Cons: notification noise, and 100+ papers don't fit without batching.
- Alternative: one bot-maintained "Upcoming locks" message in an info channel, edited on each change, listing `<t:…:F> (<t:…:R>)`.

---

## 7. Supplementary layer: AutoMod

API: https://docs.discord.com/developers/resources/auto-moderation
Help Center (via the Zendesk API): AutoMod FAQ https://support.discord.com/hc/en-us/articles/4421269296535 and Regex https://support.discord.com/hc/en-us/articles/10069840290711

- **Limits:**
  - `KEYWORD` rules: **max 6 per guild**. SPAM, KEYWORD_PRESET, MENTION_SPAM and MEMBER_PROFILE: 1 each.
  - `keyword_filter`: up to **1000 keywords × 60 chars**.
  - `regex_patterns`: up to **10**. The API doc says 260 chars each; the Help Center says "10 expressions total with 75 characters each". Conflicting, so assume 75 to be safe.
  - `allow_list`: 100 (1000 for preset).
  - `exempt_roles` ≤ 20, `exempt_channels` ≤ 50.
- **Matching:**
  - Keywords match whole words by default; `*` gives prefix/suffix/anywhere matching.
  - Regex is **Rust flavour**, with case-insensitive and unicode flags **on by default**.
  - **No backreferences.** The Rust `regex` crate also has no look-around.
- **Actions:** `BLOCK_MESSAGE` (optional `custom_message`, ≤ 150 chars), `SEND_ALERT_MESSAGE` (to a mod channel), `TIMEOUT` (needs MODERATE_MEMBERS; Keyword rules only), `BLOCK_MEMBER_INTERACTION` (member profile rules).
- **Event:** `MESSAGE_SEND` is *"when a member sends or edits a message"*, so edits are covered.
- **API control:**
  - The bot needs **MANAGE_GUILD**.
  - Rules can be created, modified (including `enabled`, `trigger_metadata`, `exempt_*`) and deleted via the API, with `X-Audit-Log-Reason`.
  - discord.js: `guild.autoModerationRules.create/edit`, `rule.setEnabled()`, `rule.setKeywordFilter()`, `rule.setRegexPatterns()` (verified in installed v14.27 source).
- **Coverage:** *"across all of your #text-channels … threads and text chat in voice channels."* Exempting a channel also exempts its threads.
- **Exemptions:** *"Users with Admin and Manage Server permissions are always exempt."*
- **Suggested use:**
  - Reserve **one** KEYWORD rule, "Exam leak guard".
  - The bot rewrites its keyword and regex list at each window start to the active papers, and disables it when no window is active.
  - Example targets: `9702/42`, `9702 42`, `9702_s26_qp_42`, and a regex like `\b9702\s*[/_\- ]?\s*(qp_?)?4[1-3]\b`.
  - Use BLOCK plus ALERT to a mod channel. Custom message: "Paper discussion is paused during exams — try again after the window".
- **Pros:** server-wide (#general, off-topic, threads), blocks before posting, catches edits, costs one rule, needs no channel changes.
- **Cons:**
  - Trivially evaded (images, "physics p4 v2", spacing, other languages).
  - **False positives** for short codes ("p42", "12").
  - Doesn't scan images.
  - Doesn't apply to Admin/Manage Server users.
  - **Does not filter bot or webhook messages**, so the repo's **confession** system (`models/confession.js`) and any bot that relays user text are a bypass. Apply the same pattern check inside the bot during windows.
  - Only 6 keyword-rule slots, shared with existing moderation rules.
- **Verdict:** a good cheap complement for the rest of the server. Not a substitute for the channel lock.

---

## 8. Prior art

### r/IGCSE bot: https://github.com/r-IGCSE/r-igcse-bot (TypeScript, discord.js, Mongo; 62k-member server; actively maintained)
- Files: `src/commands/moderation/Lockdown.ts`, `src/mongo/schemas/ChannelLockdown.ts`, `src/events/ClientReady.ts` (`refreshChannelLockdowns`).
- **Model:** `ChannelLockdown { guildId, channelId, startTimestamp: string (unix s), endTimestamp: string, mode?: "exam", locked: boolean }`, one document per channel window. Polled **every 20 s** (`createTask(..., 20000)`).
- **Commands:**
  - `/lockdown create channel [mode] [lock epoch] [unlock epoch]` (default unlock is +1 day)
  - `/lockdown remove`
  - `/lockdown bulk`, which takes a **JSON upload** of `[{channel_id, lock_time, unlock_time, mode}]`. Times can be epoch, `"now"`, or relative (`"2h"`, `"1d"`; unlock is relative to lock). This is a nice ops affordance for pasting a timetable.
  - A later PR added `/lockdown list`.
- **Lock:** on text or forum channels, `@everyone` edit `{SendMessages, SendMessagesInThreads, CreatePrivateThreads, CreatePublicThreads: false}` plus the **moderator role allowed** for the same four. For threads it uses `thread.setLocked(true)`, **unarchiving first** (PR #239). Exam mode posts a "locked" GIF. Replies use `<t:…:F> (<t:…:R>)`.
- **Pitfalls visible in their code:**
  - Unlock sets the four bits to **`null`** (clobbers prior state).
  - The scheduled unlock **never reverts the mod-role allow** (drift accumulates; only `/lockdown remove` does).
  - Still `@everyone`-only, so role allows bypass it.
  - "Is locked" is checked via `permissionsFor(@everyone)`, which ignores role overwrites.
  - **Timestamps are stored as strings and compared with `$lte` in Mongo**: lexicographic, works only while every value has 10 digits.
  - They **reject overlapping windows** per channel instead of reference-counting.
  - They detect another bot's lock ("may have been locked by another bot (sapphire)") by checking the mod overwrite's deny. This is a real-world sign that multiple bots fighting over overwrites happens.
  - Commit history shows repeated "fix locks" churn (PRs #189, #216, #239).

### zombbblob: https://github.com/zombbblob/zombbblob (a university course Discord; `src/utils.ts`, `src/command/commands/class-operations/lock.ts`, `unlock.ts`, `sync-lock-role.ts`)
- A **dedicated "Exam Locked" role** that every Student holds. It is auto-added and removed on `guildMemberUpdate` when the Student role changes.
- `/lock` **renames the role** to an "enabled" name. **The role name is the persisted lock flag, so the state lives in Discord and survives crashes.** It then ensures every channel students can communicate in has a deny overwrite for that role (`SendMessages, SendMessagesInThreads, AddReactions, Connect, Speak`). `/unlock` renames it back and **deletes** those overwrites, which means a clean restore that never touches other overwrites.
- **Reconciler-like listeners:** `channelCreate` and `channelUpdate` re-apply or remove the lock overwrite, so new or edited channels are covered.
- A "server lock explanation" channel is made visible only while locked.
- **Caveat:** a role deny loses to any other role's allow. They pre-check `canCommunicate()` by inspecting overwrites. It is a server-wide lock, not per paper.

### phen-cogs Lock (Red-DiscordBot): https://github.com/phenom4n4n/phen-cogs/blob/master/lock/lock.py
- Before locking, it **gives the bot itself an explicit SendMessages allow overwrite** so it can keep posting. This fixes the v1 notice problem.
- It modifies only the one bit, preserving the rest of the target's overwrite.
- It skips targets already denied ("was already locked").
- Unlock takes an explicit `state` (default or true) from the moderator instead of a snapshot. This is a manual acknowledgement of the restore problem.

### GitHub code search
Searches for "exam lockdown" / `examLock permissionOverwrites` found nothing else relevant. The user's own repo shows up publicly as `Vasumitra-Gajbhiye/Ralevel-Discord-Bot`.

**Ideas worth stealing:**
- bulk JSON or timetable import with relative times
- `<t:F> (<t:R>)` in confirmations
- persisted per-channel lock records with a `locked` flag and startup catch-up
- a bot self-allow overwrite
- listeners that keep new channels consistent
- state that survives crashes

**Pitfalls to avoid:** null-restore, `@everyone`-only locks, string timestamps, rejecting overlaps instead of reference-counting, and leftover staff-allow drift.

---

## Recommended locking mechanism

1. **Scope:** channel-level only. The dashboard may offer "category", which expands to channel IDs at lock time and is stored on the lease. Threads are covered through the parent. Don't lock threads individually except when a thread is the explicit target (and then track prior `locked`/`archived`).
2. **Mask by type** (`PermissionFlagsBits`):
   - Text / Announcement: `SendMessages | SendMessagesInThreads | CreatePublicThreads | CreatePrivateThreads | AddReactions`
   - Forum / Media: `SendMessages | SendMessagesInThreads | AddReactions` (+ the CreateThreads bits)
   - Voice: `Connect | Speak | Stream | SendMessages | AddReactions | UseSoundboard | UseEmbeddedActivities`, plus disconnecting current non-staff members (MoveMembers)
   - Stage: the Voice mask + `RequestToSpeak`
   - Never touch `ViewChannel` or `ReadMessageHistory`.
3. **Targets touched** (from a fresh fetch):
   - (a) `@everyone`: deny |= mask, allow &= ~mask.
   - (b) each non-staff **role** overwrite with allow ∩ mask: allow &= ~mask.
   - (c) each non-staff **member** overwrite with allow ∩ mask: allow &= ~mask.
   - (d) configured **staff bypass roles**: allow |= mask (skip roles that have Administrator).
   - (e) the **bot** (if not Admin): member overwrite allow `ViewChannel | SendMessages | EmbedLinks`.
   - Use per-target `PUT` with **explicitly computed full bitfields** (`client.rest.put(Routes.channelPermission(...))`, or `permissionOverwrites.edit(id, opts, { type, reason })` right after a forced fetch). Include an audit-log `reason` like `Exam lock: 9702/42 (2026-05-14 AM)`.
4. **Snapshot / restore:**
   - The `ChannelLock` lease holds `holders[]`, a write-ahead **full-bitfield snapshot** of every touched target (with `existed`), `applied`, `wasSynced` and the parent hash.
   - Snapshot only on the 0→1 holder transition. Restore only on 1→0.
   - Restore is a **per-bit 3-way merge over the mask bits only**: `cur == applied ? base : cur`, with drift logged.
   - DELETE overwrites that didn't exist before and are now empty.
   - Re-sync with the category via `lockPermissions()` if the channel was synced, there was no drift, and the parent changed.
5. **Holders:** exam papers (`until = unlockAt`), manual `/lock` (no expiry), and `force` unlock clears all. `/lock` and `/unlock` must go through the same lease API. Retire the separate `@everyone` bit toggling in `utils/channelLock.js`.
6. **Reconciler:** keep the existing boundary-timed `setTimeout` sweep, add a steady 60 s verification pass, and add a debounced `channelUpdate` hook.
   - Desired state comes from the schedule plus holders.
   - Verify **effective** lock state (no non-staff allow of mask bits), not just "we sent the request".
   - Resume `locking` / `unlocking` after a crash.
   - Mark per-channel failures and retry. Don't mark a paper "locked" if some channels failed. Keep a per-channel status.
7. **Execution:** start about 60 s before `lockAt`. Use a channel pool of 5–10, with targets sequential within a channel. Log `rateLimited` events. Pre-check `ManageRoles` and the mask bits to avoid 403 storms. Expect about 100–250 requests per slot, which finishes in seconds.
8. **Bot permissions:** Administrator, or at minimum:
   - ManageRoles, ManageChannels (only if using PATCH), and every mask bit at guild level
   - an explicit ManageRoles overwrite for flexibility
   - ViewChannel and SendMessages for notices
   - MoveMembers for voice
   - PIN_MESSAGES only if pinning
   - ManageGuild if managing AutoMod
   - CREATE_EVENTS if publishing events

   The application owner needs 2FA if the server enforces 2FA for moderation.
9. **UX:**
   - One notice per channel: Components v2 or embed description with `<t:unlock:F> (<t:unlock:R>)`. Edit it at unlock rather than posting again.
   - No renames. The topic is optional and best-effort.
   - Optional: a rolling "Upcoming locks" message, or EXTERNAL scheduled events per slot (cap 100).
10. **Supplementary:** one AutoMod KEYWORD rule rewritten per window with the active papers' codes (block plus alert), plus in-bot filtering for confessions and other bot-relayed text during windows.

---

## Unverified / uncertain

- **Category propagation via API:** the official docs say parent-category changes propagate to synced children server-side. Rapptz (2021) called syncing "mostly visual". Test on a staging server: PUT on the category, then check whether the synced child's overwrites changed and whether CHANNEL_UPDATE fired for the child. Also check whether an **empty** (0/0) overwrite on a non-`@everyone` target breaks "synced" in the actual Discord client (discord.js's getter says yes).
- **Exact per-route limits** for `PUT /channels/{id}/permissions/{id}` and `DELETE` are undocumented. Log the `X-RateLimit-*` headers in staging. The "10 per 15 s" figure for non-name PATCH comes from a 2020 community issue.
- **Voice:** whether Connect or Speak overwrite changes now apply to already-connected members without a reconnect. The only source is a 2021 user report. Also whether the voice-status endpoint path and permission behave as documented (not researched in depth).
- **Editing own messages** while SendMessages (or SendMessagesInThreads) is denied: probably still allowed in normal channels (only locked threads explicitly block updates). Test it. If allowed, it's a minor leak vector that AutoMod MESSAGE_SEND (which covers edits) can catch.
- Whether **AutoMod** scans forum post titles or thread names, and whether a Keyword rule applies to thread titles. Not confirmed.
- **AutoMod regex length:** the API says 260 chars and the Help Center says 75. Assume 75.
- Whether `<t:…>` renders in **channel topics** (conflicting third-party claims).
- Whether Discord's PUT-overwrite validation checks **unchanged** bits the bot lacks (e.g. rewriting a role overwrite that already contains ManageWebhooks). Moot if the bot is Administrator.
- Whether `ManageThreads` holders bypass a parent `SendMessagesInThreads` deny (the docs only say they bypass *locked-thread* restrictions).
- **Exam-window policy** (outside Discord): whether windows should extend past the paper end to cover Cambridge administrative zones or a post-exam no-discussion period. The Cambridge Handbook prohibits sharing content on social media, but I did not find an authoritative "24 hours" rule. Confirm with the server's own policy.
- The repo's `apps/bot/scripts/verify-exam-lock.js` was not read.
