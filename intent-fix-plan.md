# Privileged Intents — Fix Plan

Goal: make every answer on Discord's Privileged Intent Review form true before submitting it. Each phase below ends with a prompt you can paste into a fresh Claude chat. Run them in order, one per chat. Review and merge each phase before starting the next.

Related: [verification-plan.md](verification-plan.md) has the form answers and the review checklist.

## Decisions already made

| Topic | Decision |
|---|---|
| Presence intent | Not requested (the bot never uses it). |
| Message text | Never stored. Processed in memory and discarded. |
| XP, rank, reputation, poll votes | Kept until the user deletes them (`/privacy delete-my-data`) or asks staff. |
| Moderation records (warnings, verbal warnings, notes, mod logs, kicks, mod points, bans) and modmail / mod-DM tickets | Kept **permanently**, including after the user leaves, so members who leave and rejoin don't get a clean slate. Not removed by `/privacy delete-my-data`. Deletion requests for these are reviewed by staff case by case. |
| Confessions, certificates | Kept until the user asks staff to delete them (email or modmail). |
| Pending XP counters in Redis | Expire after 7 days (already the case). |
| New features | `/privacy` opt-out, `/privacy delete-my-data`, "Give Rep" message context menu. |

On permanent mod records: Developer ToS §5(b) allows keeping data while it's necessary for the app's stated functionality, so the privacy policy must state this plainly as part of moderation (Phase 4). The same clause also says to delete data on user request, with only a legal-requirement exception. Refusing a deletion request for moderation history is common practice and low risk, but it isn't explicitly covered, so handle requests case by case and don't promise users more than this.

---

## Phase 0 — Keep the bot online until approval

**Why:** The Developer Portal says the app holds the *limited* version of all three intents. In `PRIVILEGED_INTENTS=auto` mode, [privilegedIntents.js](apps/bot/utils/privilegedIntents.js) treats limited flags as granted and requests both intents. If Discord refuses (close code 4014, because the app is over 10,000 users), [index.js](apps/bot/index.js) exits. The bot then crash-loops instead of running in degraded mode.

**Manual check first:** look at the production startup log. If it shows `members=on messageContent=on` followed by the 4014 message, set `PRIVILEGED_INTENTS=false` in production now, then do this phase.

```text
In the ralevel-discord-bot repo (apps/bot), fix startup so the bot never exits just because Discord refuses privileged intents in auto mode.

Context: apps/bot/utils/privilegedIntents.js resolves intents from PRIVILEGED_INTENTS (auto | true | false). In auto mode it reads the application flags and treats both the full and the *Limited* flags (GatewayGuildMembersLimited, GatewayMessageContentLimited) as granted. Our app is over Discord's 10,000-user threshold, so Discord can show limited flags yet still refuse the gateway connection with close code 4014 (disallowed intents). apps/bot/index.js currently catches that error, logs explainDisallowedIntents(), and calls process.exit(1), so the bot crash-loops.

Change it so that:
1. In auto mode only, if login fails with a disallowed-intents error, the bot logs a clear warning, destroys the client, rebuilds it with no privileged intents (granted = { members: false, messageContent: false }), and logs in again. Systems check hasMessageContent(client) / hasGuildMembers(client) at setup time, so make sure every system is set up against the rebuilt client, not the old one. Read index.js carefully: some systems register listeners before login. The cleanest approach may be to move intent resolution and client construction into a function and run the whole setup again on retry. Pick whatever keeps index.js simple.
2. In true mode, keep the current behaviour (log and exit), because the operator explicitly asked for the intents.
3. describeIntents() output after a fallback should make it obvious the bot is degraded because Discord refused the intents.

Update apps/bot/scripts/verify-privileged-intents.js to cover the fallback decision (unit-test the helper that decides whether to retry; don't open a real gateway connection). Run it with `pnpm --filter @ralevel/bot verify:privileged-intents`. Update docs/environment-variables.md (PRIVILEGED_INTENTS section) and docs/troubleshooting.md ("Used disallowed intents") to describe the fallback.

Match the existing code style. Work on a new branch from main. Don't push or open a PR until I say so.
```

---

## Phase 1 — `/privacy` command: opt-out and self-serve deletion

**Why:** The form asks "Can users opt out of having their message content tracked?" and "How do users request deletion of their activity data?". This phase makes the answers **Yes** and **`/privacy delete-my-data`**.

```text
In the ralevel-discord-bot repo, add a /privacy slash command that lets members opt out of message-content processing and delete their own engagement data. This is for Discord's Privileged Intent Review: the form asks whether users can opt out of message content tracking and how they request deletion of their data.

First read: apps/bot/systems/messageRouter.js, apps/bot/systems/reputation.js, apps/bot/systems/sticky.js, apps/bot/systems/messageTracker.js, apps/bot/systems/xpFlushSystem.js, apps/bot/utils/xpKeys.js, apps/bot/systems/commands.js, an existing command such as apps/bot/commands/reputation/myrep.js, packages/db/src/models (User.js, reputation.js, pollVote.js, xpFlushGrant.js), packages/db/index.js, and docs/adding-commands.md.

Build:

1. A new Mongo model in packages/db (e.g. UserPrivacy: userId unique, contentOptOut boolean, timestamps), exported from packages/db/index.js and its index.d.ts.

2. /privacy with subcommands, all replies ephemeral:
   - `status`: shows whether the user is opted out and lists what the bot stores about them (XP / message count, reputation, poll votes) with a link to https://ralevel.com/legal/ralevel-bot/privacy-policy.
   - `message-content` with a required on/off option: sets the opt-out.
   - `delete-my-data`: shows a confirmation with Confirm / Cancel buttons (custom IDs scoped to the user, expire after ~60s). On confirm it deletes the user's User document (XP and message count), Reputation document, PollVote documents, and any pending XP for them in Redis (the pending hash keys in xpKeys.js; HDEL their userId from the count and booster hashes for our guild). It must NOT delete moderation records, modmail tickets, confessions, certificates, xp-bans or rep-bans; say so in the confirmation text and point to staff/modmail for those. Keep the user's opt-out preference. Add a per-user cooldown (e.g. once per 24h). Log a one-line entry (user ID + what was deleted, no content) through the existing mod-log utility if one fits, otherwise console.
   Check whether removing a user's XP needs their rank roles recalculated/removed (see rankSystem.js) and whether reputation tier roles should be removed (see the tier role helpers in reputation.js). Remove roles that the deleted data granted, if that's straightforward; otherwise tell me what you'd suggest.

3. Respect the opt-out wherever the bot reads message text:
   - reputation.js: skip thank-you detection entirely for messages authored by an opted-out user (they can still *receive* rep from others).
   - sticky.js: for opted-out authors, count the message as 1 line instead of reading its content.
   - Do NOT apply it to: modmail / mod-DM relays (the user or staff is explicitly sending that message through the bot) or /purge filters (moderation). Mention this scope in the command's status text.
   The check runs on every guild message, so keep it in memory: load opted-out IDs at startup into a Set and update it when the command changes the setting. No DB query per message.

4. Register the command the same way existing commands are registered (check the command catalog export and deploy-commands script, plus any guild-config role permissions in guildConfigStore / defaultGuildConfig that new commands need so that it is public to everyone).

5. Add a verify script (apps/bot/scripts/verify-privacy.js + package.json script) in the style of the other verify-* scripts, covering: opt-out skips rep detection, opted-out sticky counting, and which collections delete-my-data touches.

6. Update docs: docs/commands.md (new command), docs/systems.md (reputation + sticky opt-out behaviour), docs/database.md (new model).

Match existing code style and comment density. Work on a new branch from main. Don't push or open a PR until I say so.
```

---

## Phase 2 — "Give Rep" message context menu

**Why:** Discord's guide says context menus are the preferred alternative to reading message content. Having one lets the application say: "We offer the interaction alternative, but most thank-yous happen naturally in chat, which is why we still need Message Content."

```text
In the ralevel-discord-bot repo, add a message context menu command "Give Rep" (right-click a message → Apps → Give Rep) that gives +1 reputation to the message's author.

First read: apps/bot/systems/reputation.js (incrementReputation, tier role logic, RepBan checks, processed-message dedupe), apps/bot/systems/messageRouter.js (isReputationDisabled and the per-channel/category disabled lists), apps/bot/systems/commands.js (it may only handle chat-input commands), apps/bot/scripts/deploy-commands.js, apps/bot/scripts/export-command-catalog.js, apps/bot/systems/deployCommandsOnReady.js, and docs/adding-commands.md. Also check apps/web for anything that lists or configures commands from the exported catalog (role permissions, ephemeral settings) and make sure a context-menu command doesn't break it.

Rules, the same as automatic thank-you rep:
- No self-rep, no rep to bots.
- Respect rep-bans and the reputation feature toggle (cfg.features.reputation).
- Respect the reputation disabled channels/categories for the channel the message is in.
- One award per giver per message: if the same message was already used for rep (by thank-you detection or a previous Give Rep from this user), say so instead of awarding again. Persist this if needed so it survives restarts; keep it cheap.
- Reuse the existing tier-role assignment and the "+1 Rep → @user (N)" channel announcement so it looks identical to automatic rep.
- Reply ephemerally to the giver with the result.

Extract shared logic out of reputation.js instead of duplicating it. The loader in systems/commands.js and the deploy/catalog scripts need to support ContextMenuCommandBuilder (ApplicationCommandType.Message); keep slash-command behaviour unchanged.

Add verify coverage (extend an existing reputation verify script if there is one, otherwise a new verify-give-rep.js) and update docs/commands.md and docs/systems.md.

Match existing code style. Work on a new branch from main. Don't push or open a PR until I say so.
```

---

## Phase 3 — Infra and Developer Portal checks (manual, no code)

Do these yourself; no prompt needed.

- [ ] **MongoDB Atlas:** confirm encryption at rest is on (it is by default on all Atlas clusters; check the cluster's Security settings).
- [ ] **Production Redis (Coolify):** check whether persistence (AOF/RDB) is on. If it is, confirm the server's disk is encrypted, or turn persistence off; the data is only 7-day XP counters, so losing it on restart costs at most a few unflushed messages of XP. The form's "encrypting data at rest" answer must be true for everything you store.
- [ ] **Developer Portal → General Information:** Privacy Policy URL = `https://ralevel.com/legal/ralevel-bot/privacy-policy`, Terms of Service URL = the bot's ToS page.
- [ ] **Bot profile "About Me":** add the privacy policy link and "Use /privacy to opt out or delete your data". The form asks *where* users can find the policy.
- [ ] **Rules or info channel:** add a line linking the privacy policy and mentioning `/privacy`.

---

## Phase 4 — Website: update the bot privacy policy (ralevel-website repo)

The public policy lives in the **ralevel-website** repo (`~/Code/ralevel-website`), not here. The bot policy text is seeded from `apps/website/src/lib/legal-pages/seeds/bots.ts`, and legal pages may also be stored in the database and edited from the dashboard, so the seed alone may not change the live page.

Do this after Phases 1–2 are merged, so the policy describes features that exist.

```text
In the ralevel-website repo (~/Code/ralevel-website), update the r/alevel Bot privacy policy served at https://ralevel.com/legal/ralevel-bot/privacy-policy. Discord's Privileged Intent Review will read this page, so it must accurately match what the bot does.

First, figure out how legal pages work: read apps/website/src/lib/legal-pages/ (ensure.ts, seeds/bots.ts, seeds/website.ts, markdownToBlocks.ts, toc.ts) and find where they are stored and rendered. Tell me whether editing the seed changes the live page or whether the live copy lives in the database / is edited through the admin dashboard. If it's database-backed, don't overwrite the live page from code; give me the updated markdown and tell me exactly where to paste it in the dashboard (or propose a safe one-off update, and ask before running it).

Changes to the r/alevel Bot policy (not the Application Bot policy in the same file):

1. Replace the "Message content (limited)" bullet with:
   "Message content. The Bot reads messages in real time only to: detect thank-you messages for reputation, relay messages in modmail and moderator-DM conversations, apply moderator /purge filters, and decide when to repost sticky messages. Message text is processed in memory and is never stored or logged. Message text is never used to train machine learning or AI models."

2. Add a "Data retention" section:
   - Message text: not stored.
   - Pending XP counters: deleted automatically after 7 days.
   - XP, message counts, rank, reputation, poll votes: kept until you delete them with /privacy delete-my-data or ask us.
   - Moderation records (warnings, verbal warnings, notes, moderation logs, kicks, bans, moderation points) and modmail / moderator-DM ticket records: kept permanently, including after you leave the server, so that moderation history carries over if you rejoin. This is necessary for community safety. /privacy delete-my-data does not remove them; you can still ask us, and staff will review the request.
   - Confessions and certificate details: kept until you ask us to delete them.
   - Leaving the server does not delete your data automatically; use /privacy delete-my-data or contact us.

3. In "Data storage and security": state that data at rest is encrypted (MongoDB Atlas encryption at rest) and that dashboard access is limited to authorized staff through Clerk. Only mention Redis encryption if I confirm it; ask me.

4. In "Your rights": add the /privacy command — `/privacy message-content off` stops the Bot from reading your messages for reputation and sticky timing (it still relays modmail you send it and still applies moderator /purge filters); `/privacy delete-my-data` deletes your XP, reputation and poll votes immediately. Keep the email contact for everything else.

5. Bump the "Last updated" date to today.

Keep the existing tone and structure. Show me the full diff (or the full new markdown) before anything goes live. Work on a new branch from main. Don't push or open a PR until I say so.
```

---

## Phase 5 — Record videos, fill the form, final check

1. Record the videos listed in [verification-plan.md §4](verification-plan.md#4-videos-to-record), plus one of `/privacy` (opt-out and delete-my-data) and one of Give Rep. Upload as unlisted YouTube or "anyone with the link" Google Drive.
2. Fill the form using [verification-plan.md §3](verification-plan.md#3-form-answers). **Don't submit.**
3. Paste this into a new chat, with screenshots of the filled form:

```text
I'm about to submit Discord's Privileged Intent Review for the r/alevel bot (Application ID 1114951523131211899). Before I submit, check everything is true and consistent. Don't change code; report problems only.

1. Read intent-fix-plan.md and verification-plan.md in the ralevel-discord-bot repo.
2. Confirm every phase in intent-fix-plan.md is actually done on main: grep for the /privacy command, the opt-out checks in reputation.js and sticky.js, the Give Rep context menu, and the auto-mode 4014 fallback. Run every verify-* script in apps/bot/package.json and report the results.
3. Search the bot code for every read of message content (message.content, embeds, attachments on fetched messages) and confirm each one is listed in the privacy policy and in the Message Content answer, and that none of it is written to MongoDB, Redis, files or logs.
4. Fetch https://ralevel.com/legal/ralevel-bot/privacy-policy (the body is rendered client-side; extract the text from the page's embedded JSON if WebFetch shows only headings) and compare it with the code and with my form answers: retention periods (mod records permanent), opt-out scope, deletion command, encryption claims, no-AI-training statement.
5. Check my form screenshots: every dropdown answer is true, Presence is unticked, each intent has a video link, and the text fields match verification-plan.md §3.
6. Re-read Discord's Developer Policy and Developer Terms of Service §5 (the support-dev.discord.com pages block plain fetches; use the Zendesk API, e.g. https://support-dev.discord.com/api/v2/help_center/articles/8563934450327.json and .../8562894815383.json) and flag anything we'd be certifying falsely.

Give me a short go / no-go with a list of anything that must change first.
```

4. Submit.
