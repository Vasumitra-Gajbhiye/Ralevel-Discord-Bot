# Privileged Intent Review — Verification Plan

Status: **draft, not submitted.** Fill the form, fix the "Must fix" items, re-check, then submit.

Sources checked: Discord's *Getting Started With Privileged Intent Review*, *You Might Not Need a Privileged Intent*, Developer Policy, Developer Terms of Service (§5 User Privacy and Security), the live bot privacy policy at https://ralevel.com/legal/ralevel-bot/privacy-policy, and this repo.

---

## 1. Must fix before submitting

These are things the form or Discord's terms require that we currently fail or can't prove yet.

- [ ] **Untick "Presence Intent".** The bot never uses it (no `GuildPresences`, no `presenceUpdate`, no `.presence` anywhere in the code). Discord says requesting intents you can't justify weakens the whole application.
- [ ] **Record a video for each intent.** The form says a link is *required* for every intent requested. We have none yet. See [§4](#4-videos-to-record).
- [ ] **Add retention periods to the privacy policy.** The review asks for a "retention policy and security measures" for stored data, and ToS §5(b) requires deleting data once it's no longer needed. The policy currently lists no periods, and says "Leaving the server does not automatically erase all stored records". Proposed periods are in [§5](#5-retention-policy-to-add) — decide on them, then publish them.
- [ ] **Make the privacy policy's message-content section precise.** It currently says content is "*generally* not stored long-term", which reads as "sometimes stored". The code never stores message text, so say so plainly, and list all four uses (rep detection, `/purge` filters, modmail/mod-DM relay, sticky repost timing). Suggested wording is in [§5](#5-retention-policy-to-add).
- [ ] **Check the Developer Portal links.** ToS §5(a) requires public, up-to-date privacy policy and ToS links in the portal (General Information page). Make sure both are filled in and point to the bot's pages (`/legal/ralevel-bot/...`), not the website's.
- [ ] **Confirm the bot isn't crash-looping.** The form says the app currently holds the *limited* versions of all three intents. With `PRIVILEGED_INTENTS=auto`, [privilegedIntents.js](apps/bot/utils/privilegedIntents.js) treats limited flags as granted and requests both intents. If Discord then refuses the connection (4014) because the app is over 10,000 users, the bot exits on startup. Check the production startup log: if it shows `members=on messageContent=on` followed by a 4014 exit, set `PRIVILEGED_INTENTS=false` in production until approval comes through.

## 2. Already compliant

- Public privacy policy, linked from `/privacy-policy`, covers what's collected, how it's used, third parties, and how to request deletion (email `r.alevelserver@gmail.com`).
- Message text is never stored. The only message-derived data in MongoDB is IDs (`ModmailMessageLink` keeps thread and DM message IDs).
- Text that *is* stored (confessions, notes, stickies, polls, definitions) comes from slash commands and modals, which don't need Message Content.
- No AI training, no selling or sharing of data, no ads, no unsolicited DMs (only modmail and moderator DMs).
- Users can report issues through modmail (Developer Policy requirement).
- MongoDB Atlas encrypts data at rest by default (ToS §5(c)).
- Server Members is used only for join events; single-member lookups use REST `members.fetch(id)`, which works without the intent.

## 3. Form answers

### Application Details
> What does your application do?

```
r/alevel Bot is the in-house bot for the r/alevel Discord server, a study community of 40,000+ students taking Cambridge and Edexcel A-Level / IGCSE exams. It's built and run by the server's own staff and is used only in our server.

Features:
- Moderation: slash-command warnings, timeouts, kicks/bans, notes, mod logs, /purge, channel locks during exam sessions.
- Modmail: users DM the bot to open a support ticket; staff answer from a private thread and the bot relays messages both ways.
- Engagement: XP and rank roles from message counts, reputation points when members thank each other for help, leaderboards, polls, question of the day.
- Community tools: anonymous confessions (submitted through a modal and reviewed by staff), sticky messages, subject definitions, welcome images for new members, certificate applications for volunteer contributors.

Almost everything is driven by slash commands, buttons and modals. Since our privileged intents were removed, the bot already runs in a degraded mode without them; the features that still need them are listed under each intent below.

Privacy policy: https://ralevel.com/legal/ralevel-bot/privacy-policy
```

### Dropdowns

Answers assume [intent-fix-plan.md](intent-fix-plan.md) Phases 0–4 are done.

| Question | Answer |
|---|---|
| Public Privacy Policy? | **Yes** |
| ↳ Where is it available? | `Linked in the bot's About Me, via the /privacy-policy and /privacy commands, in our server's rules channel, and in the footer of ralevel.com.` |
| ↳ Link | `https://ralevel.com/legal/ralevel-bot/privacy-policy` |
| Intents | **Server Members** ✅ · **Presence** ❌ untick · **Message Content** ✅ |
| Server Members → storing API Data off-platform? | **Yes** (MongoDB: user IDs with XP, rep, mod records, tickets) |
| ↳ Storing for 30 days or less? | **No** (XP/rep until deletion; mod records permanently) |
| ↳ How do users request deletion? | `Run /privacy delete-my-data in our server to delete XP, reputation and poll votes instantly. For anything else, DM the bot (modmail) or email r.alevelserver@gmail.com.` |
| ↳ Encrypting at rest? | **Yes**, only after the Phase 3 Redis check |
| Message Content → users can opt out? | **Yes** (`/privacy message-content off`, after Phase 1) |
| Message Content → storing message content off-platform? | **No** (this hides the 30-day and deletion sub-questions) |
| Message Content → used to train ML/AI models? | **No** |

### Why do you need the Guild Members intent?

```
We use it only to receive GUILD_MEMBER_ADD events, for our welcome system: when someone joins, the bot renders a welcome image with their avatar and username and posts it in our welcome channel with a ping. In a server of our size this is the main way new members find the rules, channels and help resources.

Join events can't be received without this intent; interactions don't cover it because the new member hasn't done anything yet.

We do not list or cache the member list. Where we need a specific member (e.g. to add a rank role), we fetch that one member by ID over REST. Nothing from the join event is stored: the image is generated in memory and discarded after posting.
```

### Why do you need the Message Content intent?

```
We read message text in real time for four features. No message text is ever stored or logged; it is processed in memory and discarded.

1. Reputation (helpfulness points). Our server is a homework-help community. When a member replies to someone's message, or @mentions them, with a thank-you word ("thanks", "ty", etc. — the list is configured by staff), the bot gives the helped-by member +1 reputation. Rep drives helper roles and leaderboards and is the core incentive for students to answer questions. Thank-yous are written naturally in chat, mostly as replies to other members, so the bot neither is mentioned nor receives the content without the intent. Staff can disable rep detection per channel or category, and any member can turn it off for their own messages with /privacy message-content off. We also offer a "Give Rep" message context menu, but most thank-yous happen naturally in chat, so it doesn't replace detection.

2. Modmail staff replies. When a user opens a ticket, staff discuss it in a private thread and their replies are relayed to the user's DMs (with attachments and formatting). Staff messages in that thread don't mention the bot, so without the intent they arrive empty. Our current workaround forces staff to @mention the bot on every message, and any reply that misses it silently fails to reach the user, which is a real risk for support and safety tickets. Internal notes (messages starting with ".") are never relayed.

3. /purge content filters. Moderators clean up raids and spam after the fact with /purge filtered by links, keyword, attachments, embeds or images. These filters need the content of already-posted messages; AutoMod only prevents new messages and can't do retroactive cleanup.

4. Sticky messages. The bot reposts staff "sticky" notices after enough new chat has pushed them up; it counts lines of new messages to decide when. (Minor; without content it falls back to counting messages.)
```

### Videos fields
One link per intent. Unlisted YouTube or Google Drive (anyone with link) works. See §4.

## 4. Videos to record

Record in the real server (or a test server with the production bot). Show the user typing *and* the bot's result in the same clip.

- [ ] **Server Members:** an alt account joins → welcome image appears.
- [ ] **Message Content 1:** reply "thanks" to someone's message → `+1 Rep` appears. Then "ty @user" without a reply → rep awarded.
- [ ] **Message Content 2:** user DMs the bot → ticket thread opens → staff types a reply *without* mentioning the bot → user receives it in DMs. Also show a `.` note not being relayed.
- [ ] **Message Content 3:** `/purge` with `filter:links` (or `keyword`) removing only matching messages.
- [ ] (Optional) Sticky repost after a block of chat.

Bot must have the intents to record this. If you can't (the app is over threshold), record in a test server with a *separate test bot* running the same code, and say so in the link description.

## 5. Retention policy to add

Proposed periods — **adjust to what you actually want, then put them in the privacy policy.** Don't put numbers in the form that the policy doesn't state.

| Data | Proposed retention |
|---|---|
| Message text | Not stored (processed in memory only) |
| Pending XP counters (Redis) | Expire after 7 days (`PENDING_KEY_TTL_SEC` in [xpKeys.js](apps/bot/utils/xpKeys.js)) |
| XP, rank, reputation totals | Until the user asks for deletion, or N months after leaving the server |
| Moderation records (warnings, notes, mod logs, bans) | N months/years, for community safety |
| Modmail tickets (IDs and metadata only) | N months after closing |
| Confessions | N months after posting |
| Certificate name + email | Until delivered + N months |

Suggested privacy-policy wording for message content:

> **Message content.** The Bot reads messages in real time only to detect thank-you messages for reputation, relay staff replies in modmail threads, apply moderator `/purge` filters, and time sticky-message reposts. Message text is processed in memory and is never stored or logged.

Security sentence for the policy (and form, if asked): MongoDB Atlas encrypts data at rest; dashboard access goes through Clerk and is limited to authorized staff.

## 6. Nice-to-haves

These make approval more likely but aren't required.

- [ ] **"Give Rep" message context menu** (right-click a message → Apps → Give Rep). Reputation is the weakest of the four use cases, because Discord's guide pushes context menus first. With this in place, the application can say: "We offer a context menu too, but most thanks happen naturally in chat."
- [ ] **User opt-out from content scanning**, e.g. `/privacy rep-detection off`, which makes the bot ignore that user's messages for rep. Lets you answer **Yes** to the opt-out question.
- [ ] **Self-serve data deletion**, e.g. `/privacy delete-my-data` that clears XP, rep and polls votes (not mod records). ToS §5(b) asks for an "easily accessible way" to request deletion; email works, a command is better.
- [ ] **Automatic cleanup job** that enforces the §5 retention periods, so the policy and the code match.
- [ ] **Redis at-rest encryption check.** Production Redis on Coolify holds only 7-day XP counters, but if it writes to disk (AOF/RDB), confirm the server disk is encrypted. ToS §5(c) requires encryption at rest.
- [ ] **Keep a change log for the yearly re-review.** Discord asks for a record of how data use changes over time. A short section in `docs/` is enough.

## 7. Final check before submitting

When the above is done, ask Claude to re-check:
- privacy policy text vs. the code,
- form answers vs. the policy,
- video links open without sign-in,
- Presence is unticked.
