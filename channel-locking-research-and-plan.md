# Exam channel locking: research and plan

Status: **proposal** · Written 2026-09-30 · Scope: Cambridge International AS & A Level

Supporting material (full agent reports, parsed timetables, simulation scripts) lives in [`docs/channel-locking-research/`](docs/channel-locking-research/):

| File | What it is |
|---|---|
| `research-cambridge.md` | Cambridge series, zones, key times, variants, discussion rules, timetable publishing (with sources) |
| `research-discord.md` | Discord permission resolution, lock masks, rate limits, snapshot/restore, prior art (with sources) |
| `audit-v1.md` | Line-referenced audit of the existing exam-lock v1 in this repo |
| `cambridge_2026_timetables_parsed.csv` | 3,490 rows: every zone × component for June 2026 and Nov 2026, with UTC key times |
| `parse_week.py`, `simulate_v2.py` | The PDF parser, and the lock-window simulation implementing the final rules in §5. All numbers in this plan come from `simulate_v2.py` (`simulate.py` and `detail.py` are earlier drafts) |

---

## 0. Summary

- **What we're building:** admins load a Cambridge timetable into the dashboard. For each paper the bot computes when *any* zone could be sitting it, and makes the subject's channels read-only for that period. Only staff roles can still post.
- **Key times make this tractable.** Cambridge fixes a UTC "key time" for every zone and session. At that moment every candidate in the zone must be in the exam or under supervision. The key times form a fixed six-slot ladder and don't move with daylight saving. So admins enter only what the PDF says (zone, date, AM/PM), and the bot derives exact instants.
- **Zones don't always sit a paper on the same day.** In Nov 2026, 25 of 139 A Level papers have zones sitting more than a day apart. Maths 9709 Paper 1 is sat by Zones 1–4 on 30 Sep and Zones 5–6 on 13 Oct. So the unit we lock is a **cluster of sittings**, not a paper. Between clusters the channel reopens and shows a "still pending for Zones X" reminder.
- **The existing v1 lock is unsafe.**
  - It denies Send only on `@everyone`. Any role overwrite that *allows* Send defeats it, and threads and forum replies stay open.
  - Unlock resets the bit to neutral, which wipes whatever an admin had set before.
  - Manual `/unlock` silently ends an exam lock, and v1 can orphan locks under dashboard races.
  - v2 therefore gets one lock record per channel that snapshots the original permissions, tracks every reason the channel is locked (exam or manual), and restores exactly what it changed.
- **Nov 2026 is running now** (28 Sep – 13 Nov). **155 of its 164 A Level lock windows are still ahead, with one almost every day.**
  - **Starting today:** mods cover the windows by hand with `/lock` and `/unlock`, using the rota in Appendix A.
  - **Phase 0 (3–4 days):**
    - give v1 a safe, exam-only lock (snapshot and restore, staff allow, threads blocked)
    - harden v1's sweeper
    - bulk-load the rest of Nov 2026 from the parsed timetable
  - **v2** then goes live after the Nov series ends, targeting **March 2027** (India/Zone 4) and **June 2027**.

---

## 1. Decisions made

| Question | Decision |
|---|---|
| How long to lock | **From the first zone's start to the last zone's end, plus a buffer** |
| Paper sat on different days by different zones | **Lock each cluster of sittings separately.** In between, keep a "still pending for Zones X until <date>" reminder in the channel |
| What a locked channel is like | **Read-only.** Visible; no sending, reacting, thread creation, forum posts or thread replies |
| Who can still talk | **Configured staff roles only** (plus Discord Administrators, who bypass all overwrites anyway) |
| Channel layout | **Mixed.** One subject may map to several channels (text, forum, voice) and/or whole categories; a channel may belong to several subjects |
| Boards in scope | **Cambridge AS & A Level** (8xxx/9xxx syllabuses). The model shouldn't block IGCSE or other boards later, but we build nothing for them now |
| Timetable entry | **Paste or upload CSV → preview with warnings → commit**, plus manual edits |
| Existing v1 | **Not used in production yet.** Phase 0 loads Nov 2026 into it. v2 uses **new collections** and replaces v1 at cutover after 13 Nov, then v1's data is deleted. No migration |
| Extras | **Pre-lock warning** and **`/exam-schedule`** command |
| Nov 2026 | **Ship a stopgap now**, then build v2 properly |

---

## 2. How Cambridge exam timing works

Full sources are in `research-cambridge.md`.

### 2.1 Series

| Series | Who sits it | Dates |
|---|---|---|
| **Feb/March** | **India and Romania only.** The timetable is labelled "Administrative zone 4" | March 2027: 3 Feb – 4 Mar 2027 (final timetable already public) |
| **May/June** | All 6 zones (+ UK copy of Zone 3) | June 2026 ran 23 Apr – 9 Jun. **June 2027 final timetable is due publicly end of Oct 2026** |
| **Oct/Nov** | All 6 zones (+ UK) | **Nov 2026: 28 Sep – 13 Nov 2026 (running now)** |

- There is **no Cambridge contingency day**. Disruption is handled by timetable deviations of at most 24 h after the key time. This is an absence of evidence, not an explicit statement.
- Windowed components (speaking tests, coursework, art) have no key time and are **out of scope**.

### 2.2 Zones

Zones are assigned **by country, and sometimes by state or province, not by UTC offset**. Some examples relevant to our members:

| Zone | Examples |
|---|---|
| 1 | USA Pacific/Mountain/Central states, Mexico, Colombia, Peru, western Canada |
| 2 | USA Eastern states, Brazil, Argentina, Chile, Caribbean, eastern Canada |
| 3 | UK, Europe, Egypt, Nigeria, Kenya, Saudi Arabia, Qatar, Kuwait, Bahrain, South Africa, Türkiye |
| 4 | **Pakistan, India, UAE, Oman, Sri Lanka, Bangladesh, Nepal, Mauritius**, Jakarta/Java, Thailand, Vietnam, Russia (Moscow) |
| 5 | **Malaysia, Singapore, China, Hong Kong**, Philippines, Japan, South Korea, Australia, Bali |
| 6 | New Zealand, Fiji, Tonga |

The US, Canada and Indonesia are split between zones, and Florida, Tennessee and Michigan span two. The full 266-location table is in the research file.

### 2.3 Key times: a fixed UTC ladder

- **Definition:** a key time is "a defined point in a timetabled session when candidates must be in the exam or under Full Centre Supervision" (Handbook 2026).
- **Centre freedom:** centres may start before or after it. Candidates who finish early are held until the key time, and candidates who start late are supervised from the key time until they start. Under supervision they have no phones and no contact.
- **UTC values:** measured across all 266 locations in Cambridge's own lookup tool, the key times depend only on zone and session.

| Zone | AM | PM | EV |
|---|---|---|---|
| 1 | 17:00 | 21:00 | — |
| 2 | 13:00 | 17:00 | — |
| 3 | 09:00 | 13:00 | — |
| 4 | 05:00 | 09:00 | 13:00 |
| 5 | 01:00 | 05:00 | 09:00 |
| 6 | **21:00 on the previous UTC day** | 01:00 | — |

Read the other way, there are six global slots, four hours apart:

| UTC slot | Sessions at that instant |
|---|---|
| 01:00 | Z5 AM, Z6 PM |
| 05:00 | Z4 AM, Z5 PM |
| 09:00 | Z3 AM, Z4 PM, Z5 EV |
| 13:00 | Z2 AM, Z3 PM, Z4 EV |
| 17:00 | Z1 AM, Z2 PM |
| 21:00 | Z1 PM, Z6 AM (next local day in Z6) |

- **The UTC values don't change with DST.** Local times do: the UK moves from 10:00 BST to 09:00 GMT on 25 Oct 2026, the US changes on 1 Nov 2026, NZ and AU change too. This is why **v2 stores UTC key times and never local clock times**, and shows times to members with Discord `<t:…>` timestamps, which render in each viewer's own timezone.
- **Key times can be exceptional per series.** In the March series, Romania (a Zone 3 country) uses Zone 4's UTC key times. So each series carries its own copy of the ladder, editable.

### 2.4 Paper codes and variants

- **Code format:** `9702/42` = syllabus `9702`, component digit `4` (the paper), variant `2`.
- **Variants:** normally three variants, each sat by **two zones at the same UTC instant**. Which zones pair up **changes by syllabus and series**.
  - June 2026 9702: v2 = Z4 AM + Z5 PM, v1 = Z2 AM + Z3 PM, v3 = Z1 PM + Z6 AM.
  - Nov 2026 9702: v3 = Z5/Z6, v2 = Z3/Z4, v1 = Z1/Z2.
- **Exceptions:**
  - **Single-variant papers use codes `0N`,** meaning Paper N with no variants. For example, 8679/02 and 8679/03 are Afrikaans Papers 2 and 3. One variant is sat worldwide at up to three different instants.
  - **Practicals break the digit rule.**
    - Physics 9702/31–/36 are two different practical papers ("Practical 1" and "Practical 2") on different days.
    - Zones 3–6 timetable both; Zones 1–2 only one.
    - So "paper = syllabus + first digit" is only a default grouping.

### 2.5 The same paper is often sat on different days

Computed from all 2026 zone timetables (AS & A Level only):

| | June 2026 | Nov 2026 |
|---|---|---|
| Timetable rows (zone × component, syllabus 8xxx/9xxx) | 795 | 785 |
| Syllabuses | 48 | 43 |
| Logical papers (default grouping, §5.3) | 153 | 139 |
| Papers split into more than one lock window | 5 | **25** (incl. **every** 9709 Maths and 9701 Chemistry paper) |
| Lock windows (clusters) | 158 | 164 |
| Window length: median / max | 18.8 h / 20.3 h | 19.1 h / 35.4 h |
| Peak number of syllabuses locked at once | 9 | 8 |

Nov 2026 examples:

| Paper | Sittings (UTC key time → zones) |
|---|---|
| 9709 Pure Maths 1 | 30 Sep 09:00 → Z3/Z4 · 30 Sep 17:00 → Z1/Z2 · **13 Oct 01:00 → Z5/Z6** |
| 9701 Chemistry P4 | **16 Oct 09:00 → Z3/Z4** · 3 Nov 01:00 → Z5/Z6 · 3 Nov 17:00 → Z1/Z2 |
| 9274 Classical Studies P3 | 28 Oct 01:00 → Z5/Z6 · 28 Oct 17:00 → Z1/Z2 · 29 Oct 09:00 → Z3/Z4 (one cluster, 35 h lock) |

A strict single window per paper would lock channels for weeks. Assuming one channel per subject in Nov 2026:

| Syllabus | Lock each cluster (chosen) | One window per paper (rejected) |
|---|---|---|
| 9709 Maths | 8 periods, **75 h** total, longest 19 h | 500 h (**21 days**) continuous |
| 9701 Chemistry | 7 periods, **96 h**, longest 20 h | 919 h (**38 days**) |
| 9702 Physics | 5 periods, 90 h | 367 h |
| 9700 Biology | 5 periods, 90 h | 583 h |
| 9708 Economics | 6 periods, 74 h | 366 h |
| 9618 Computer Science | 5 periods, 58 h | 179 h |

### 2.6 What Cambridge says about discussing papers, and what "safe" means

- **To candidates** (Information for candidates 2026 / Handbook 2026 §5.3.2, new in 2026): candidates "must not discuss the content of a question paper … with any other candidate until either the Key Time or end of the assessment window has passed."
  - It doesn't say *whose* key time. Read literally it means the candidate's own zone.
- **Uploading papers** to "publicly accessible platforms, social media or chat groups" is banned outright, with no time limit. That supports a standing server rule of *no photos or copies of question papers, ever*.
- **The "24-hour rule"** is about centres storing physical papers for 24 h. It is **not** a candidate discussion rule.
- **Clashes and deviations:** a candidate can have a paper moved, but never earlier and never more than 24 h after the key time. They stay supervised throughout, possibly overnight.
- **Consequences for the lock window:**
  - Nobody who has sat a paper is free before the **first** key time, because early finishers are held until the key time. So a lock starting shortly before the first key time is enough.
  - After the **last** key time, everyone who hasn't finished is in the exam room or supervised. Unlocking at the estimated end of the last sitting, plus a buffer, is therefore conservative. The strictest possible bound is "last key time + 24 h" (deviations). We offer it as a preset but don't default to it.

### 2.7 Where timetable data comes from

- **Format:** one PDF per zone per series, versioned ("Version 2, January 2026"). **No public CSV, iCal or JSON** exists; the CSV on Cambridge Direct is for logged-in exam centres only.
- **Parsing:** the weekly view of the PDFs parses reliably with `pdftotext -layout` plus a regex (`parse_week.py`), and all 14 June and Nov 2026 zone PDFs were parsed this way.
- **Data quality:** Cambridge PDFs contain typos. The Nov 2026 Zone 6 PDF says "Saturday 07 October" where it means 07 November. **Any import must check that the weekday matches the date.**
- **Lead time:** final timetables are public about 6 months ahead; Cambridge sometimes revises them. So re-import with a diff is a real need.

---

## 3. Discord mechanics that shape the design

Full sources are in `research-discord.md`.

### 3.1 Why an `@everyone`-only lock fails

Discord computes channel permissions in this order:

1. guild roles
2. channel `@everyone` overwrite
3. **all role overwrites combined, with allows applied after denies**
4. member overwrite

So:

| Setup in the channel | Can a member talk under an `@everyone` Send deny? |
|---|---|
| Role grants Send at guild level, no channel overwrite | No |
| **Role overwrite in the channel allows Send** (e.g. a "Physics" opt-in role) | **Yes: lock bypassed** |
| Member overwrite allows Send | **Yes** |
| Administrator / server owner | Yes (always) |
| Mod role with ManageChannels/ManageMessages but no Admin, no overwrite | **No: mods get locked out too** |

A correct "everyone except staff" lock must therefore:

- deny on `@everyone`
- **remove** the lock bits from the allow of every non-staff role and member overwrite
- **add** an allow for the staff bypass roles
- give the bot itself an allow if it isn't Administrator, otherwise it can't post its own notice

### 3.2 What to deny, by channel type

| Channel type | Deny (discord.js `PermissionFlagsBits`) |
|---|---|
| Text / Announcement | `SendMessages`, `SendMessagesInThreads`, `CreatePublicThreads`, `CreatePrivateThreads`, `AddReactions` |
| Forum / Media | `SendMessages` (= create post), `SendMessagesInThreads` (= reply), `AddReactions`, and the two CreateThreads bits (harmless) |
| Voice (optional, off by default) | `Connect`, `Speak`, `Stream`, `SendMessages`, `AddReactions`, `UseSoundboard`, `UseEmbeddedActivities` |
| Stage (optional) | Voice mask + `RequestToSpeak` |

Notes:

- **Never touch `ViewChannel` or `ReadMessageHistory`**, since the lock is read-only.
- **Existing threads and forum posts are covered automatically:** threads inherit the parent's `SendMessagesInThreads`. There's no need to lock threads one by one.
- **Slash commands are also blocked** in the channel, because they need `SendMessages`. Buttons on old bot messages still work.
- **Voice:** denying `Connect` doesn't kick people already connected. Disconnecting them needs `MoveMembers`. The plan leaves voice locking off by default.

### 3.3 Snapshot and restore; category sync

- **Every overwrite write is read-modify-write.** A PUT replaces a target's whole allow/deny, and discord.js `edit()` merges with the *cached* overwrite. So always fetch fresh, and write exact bitfields.
- **Restoring to `null` is wrong.** Restore per bit with a **3-way merge** between:
  - `base` (the snapshot)
  - `ours` (what we wrote)
  - `cur` (what's there now)

  If `cur == ours`, put back `base`. Otherwise an admin changed it during the lock, so keep `cur` and log the drift.
- **Category sync is equality-based.**
  - Editing a child de-syncs it; restoring it exactly re-syncs it.
  - An empty `0/0` overwrite left behind keeps it de-synced, so **delete overwrites we created**.
  - **Lock at channel level, never by editing the category.** Unsynced children would be silently skipped, and a child edited during a category lock stays locked forever.
  - "Lock this whole category" in the dashboard should expand to its child channels at lock time.

### 3.4 Rate limits

- Overwrite PUTs have per-channel buckets and a global limit of 50 req/s. The "2 per 10 minutes" limit applies only to **channel name and topic** edits, which we never make on the critical path.
- **Worst case per slot:**
  - at most 6 windows start at the same instant (measured on 2026 data)
  - about 5 channels per subject (an assumption; the real number is unknown)
  - 2–6 PUTs per channel

  That totals roughly 60–200 requests, which discord.js's queue finishes in seconds.
- **Avoid repeated 403s:** 10,000 invalid requests in 10 minutes gets the bot IP-banned. So a channel the bot can't edit must back off, not be retried every sweep.

### 3.5 Bot permissions

- **Simplest:** give the bot **Administrator**.
- **Otherwise the bot needs:**
  - `ManageRoles` (required to edit overwrites)
  - every bit in the lock mask, **in the guild or in the channel's parent category** (a bot can only allow or deny bits it has there). A category that denies `@everyone` View or Send can break a non-Admin bot, so the preflight must evaluate the parent category too
  - `ViewChannel`, `SendMessages`, `EmbedLinks` for notices
  - `MoveMembers` only for voice
- **2FA:** if the server enforces 2FA for moderation, the bot owner's account needs 2FA, otherwise Discord returns error 60003.

---

## 4. What exists today (v1)

Commit `49b72a1` "added channel locking v1". Full line-referenced audit is in `audit-v1.md`.

**What v1 has:**

- **Models:**
  - `ExamSession`: name plus one AM and one PM UTC `HH:mm` pair.
  - `ExamPaper`: label, date, slot, channelIds, lockAt/unlockAt, status, and the `forceUnlock`/`cancelAfterUnlock` flags.
- **Sweeper:** a self-scheduling one (`apps/bot/systems/examLockSystem.js`) with an adaptive timeout capped at 60 s.
- **Dashboard:** a page at Operations → Exam locking and CRUD routes under `/api/exam-sessions`.

**Problems that v2 must fix:**

| # | Problem | Where |
|---|---|---|
| H1 | Unlock sets `SendMessages: null` and wipes prior state. Manual `/lock` and exam locks undo each other | `apps/bot/utils/channelLock.js:18-22` |
| H2 | `@everyone`-only, Send-only lock: role allows, threads and forum replies bypass it | `channelLock.js:9-13` |
| H3 | Discord work happens *before* the status is saved, so a dashboard cancel, edit or delete in that gap is lost or orphans a permanent lock | `examLockSystem.js:169-210` |
| H4 | Sweeper queries have no `guildId` filter, so a dev bot or the verify script on the same Mongo acts on production papers | `examLockSystem.js:29-49, 271, 301, 324` |
| H5 | UTC `HH:mm` combined on the same UTC date: no zones, no DST, no windows crossing midnight UTC | `packages/db/src/examWindows.js` |
| M | No web→bot signal (`wakeExamLockSystem` is never called); paper marked locked even if every channel failed; archive does nothing; nothing checks Discord's actual state; unhandled rejection in reschedule; `/lock-status` is blind to exam locks and hidden from most mods (`ManageChannels` default) | see audit §2 |

**Kept in spirit:**

- the adaptive `setTimeout` scheduler
- lock-before-unlock ordering
- ModLog + modLog-embed logging
- the API route pattern (`requireAllowlistedAuth` + zod + `GUILD_ID` scoping)
- the page shell components

**Replaced:** the models, the window math, the lock primitive, and the page contents.

---

## 5. The lock-window algorithm

The rules are pure functions in `packages/shared` so the bot and the dashboard preview compute identical results.

### 5.1 Inputs

- **Series:** the key-time ladder (`zone × session → {utc: "HH:mm", dayOffset: 0 | -1}`), the enabled zones, and the policy.
- **Sittings:** one per timetable row. `{zone, syllabus, component, localDate, session, durationMinutes}`, plus an optional `keyAtOverride` if Cambridge reschedules something.

### 5.2 Key instant of a sitting

```
keyAt = UTC midnight of localDate + dayOffset(zone, session) days + utc(zone, session)
```

Example: Zone 6 AM on local 2026-06-04 → 2026-06-03 21:00Z.

### 5.3 Papers and clusters

1. **Group sittings into logical papers.** The default key is `syllabus + paper number`:
   - The paper number is the component's first digit (`9709/12` → "9709 Paper 1").
   - **For single-variant `0N` codes it is the second digit** (`8679/02` → "8679 Paper 2").
   - Admins can rename or split a group in the dashboard.
   - **Over-grouping is safe.** Step 2 still splits sittings that are far apart, so the only effect is a label or reminder that's too cautious.
   - **Under-grouping is not safe.** It would unlock a channel between two zones sitting the same paper. That's why the default groups broadly.
2. **Cluster each paper's sittings.** Sort by `keyAt`, and start a new cluster **only** when the gap to the previous sitting is greater than `clusterGapHours` (default **24**).
   - There is deliberately no "zone repeats → split" rule. When two over-grouped papers interleave, such a rule would split a real paper's same-day sittings and reopen the channel mid-paper.
   - A zone appearing twice in one cluster is shown as a **warning** ("this group probably holds two papers; consider splitting").
   - **Invariant:** all sittings of one component code (e.g. every `9609/13` row) fall in the same cluster. If a gap would separate them, the clusters are merged. The same-variant Z1-AM/Z6-AM pairs can be up to 20 h apart.
   - **Checked on 2026 data:** no component spans clusters.
     - Sittings 16–20 h apart merge. 9274 P3/P4 become one 35 h window. 9609/13 is sat by Zone 6 on 11 Oct 21:00 and Zone 1 on 12 Oct 17:00, which share one 23 h window.
     - Sittings ≥ 28 h apart split: 9618 P2, 8695 P2, 9695 P1, 9701 P1.
3. **Lock window per cluster:**

```
lockAt   = firstKeyAt − lockBufferMinutes                                  (default 60)
unlockAt = lastKeyAt + ceil(maxDuration × (1 + extraTimePercent/100))      (default 25%)
                     + unlockBufferMinutes                                  (default 30)
```

`unlockRule` presets, per guild with per-series override:

| Preset | unlockAt |
|---|---|
| `keyTime` (Cambridge-literal minimum) | `lastKeyAt + unlockBufferMinutes` |
| **`estimatedEnd` (default: "last end + buffer")** | as above |
| `plus24h` (deviation-proof) | `lastKeyAt + 24 h` |

4. **Pending reminders.** Each cluster records `pendingLater = [{zones, firstKeyAt}]` for later clusters of the same paper, **counting only zones that haven't sat the paper in an earlier cluster**.
   - **Genuine split** (the later zones are all new): 9709 P1 is sat by Zones 1–4, then Zones 5–6. The reminder names Zones 5–6.
   - **Probably a different paper** (every later zone already sat it): 9702 P3 is sat by Zones 1–6 on 8 Oct, then Zones 3–6 on 22 Oct. The second date is the separate "Practical 2" paper.
     - That cluster gets **no reminder**.
     - It is labelled "Paper 3 (second sitting)".
     - The import preview suggests splitting the group.

### 5.4 From windows to channels

- **Channel mapping:** each window belongs to a syllabus. Its channels are that subject's mapped channels, plus categories expanded to their children, plus or minus any per-paper channel override. This is resolved at execution time, so editing the mapping never needs a recompile.
- **Merging:** for each channel, the desired locked intervals are the union of all its windows. Gaps of `mergeGapMinutes` or less (default **60**) are bridged, so back-to-back papers don't unlock and relock with double notices.
- **Pre-lock warning:** posted `preLockWarningMinutes` (default **15**) before each *merged* interval starts. It is posted once per interval, not per window.

### 5.5 Worked example: 9709 Maths, Nov 2026 (defaults)

| Window | Zones | Components | Duration | Lock (UTC) | Unlock (UTC) | Length |
|---|---|---|---|---|---|---|
| P1 cluster 1/2 | 1,2,3,4 | 11/12 | 110m | Wed 30 Sep 08:00 | Wed 30 Sep 19:48 | 11.8 h |
| P5 1/2 | 1,2,3,4 | 51/52 | 75m | Wed 07 Oct 08:00 | Wed 07 Oct 19:04 | 11.1 h |
| **P1 2/2** | **5,6** | 13 | 110m | Tue 13 Oct 00:00 | Tue 13 Oct 03:48 | 3.8 h |
| P6 1/2 | 3,4 | 62 | 75m | Tue 13 Oct 08:00 | Tue 13 Oct 11:04 | 3.1 h |
| P2 1/2 | 1,2,3,4 | 21/22 | 75m | Tue 13 Oct 08:00 | Tue 13 Oct 19:04 | 11.1 h |
| P4 1/2 | 1,2,3,4 | 41/42 | 75m | Tue 13 Oct 08:00 | Tue 13 Oct 19:04 | 11.1 h |
| P5 2/2 | 5,6 | 53 | 75m | Thu 15 Oct 00:00 | Thu 15 Oct 03:04 | 3.1 h |
| P3 1/2 | 1,2,3,4 | 31/32 | 110m | Thu 15 Oct 08:00 | Thu 15 Oct 19:48 | 11.8 h |
| P2 2/2, P4 2/2 | 5,6 | 23, 43 | 75m | Mon 19 Oct 00:00 | Mon 19 Oct 03:04 | 3.1 h |
| P6 2/2 | 1,2,5,6 | 61/63 | 75m | Mon 19 Oct 00:00 | Mon 19 Oct 19:04 | 19.1 h |
| P3 2/2 | 5,6 | 33 | 110m | Wed 21 Oct 00:00 | Wed 21 Oct 03:48 | 3.8 h |

How #maths behaves on 13 Oct:

- It locks 00:00–03:48 for P1 (Zones 5/6).
- It reopens at 03:48, because the next window starts at 08:00, more than 60 min later.
- It relocks 08:00–19:04 for P2/P4/P6.
- From 30 Sep 19:48 to 13 Oct 00:00 it is open, apart from the 7 Oct Paper 5 lock. Throughout that time it shows the reminder: *"9709 Paper 1 — Zones 5 & 6 sit it on 13 Oct 01:00 UTC (shown in local time). Please don't discuss Paper 1 until then."* After 7 Oct the reminder also lists Paper 5, which Zones 5 & 6 sit on 15 Oct.

---

## 6. v2 architecture

```
 Dashboard (Next.js)                         MongoDB                          Bot (discord.js)
 ────────────────────                        ───────                          ────────────────
 Settings → Exam locking ──PUT /api/config──▶ GuildConfig.examLocking ◀─15s poll── guildConfigStore
 Ops → Exam timetable ────import / edit────▶ ExamSeries, ExamPaper
        │ compileSeries()  (packages/shared)
        └────────────────────────────────▶ ExamLockWindow ◀───────reads──── reconciler (examLockSystem)
 Ops → Exam locks (live) ◀──────reads──────── ChannelLock    ◀───CAS writes── lock engine ──PUT/DELETE overwrites──▶ Discord
                         ──writes──────────▶ ExamLockAction ◀──consumes───── reconciler (force open / retry / release)
                         ──POST /internal/exam-lock/wake (best effort)──────▶ commandSyncServer
 Channel pickers + preflight ◀──reads─────── ChannelDirectory ◀──publishes─── channelDirectory system
```

The principles:

- **The timetable is what admins edit.**
- **Windows are compiled output.** They are computed in the web from the timetable plus policy.
- **Channel lock state is the only thing that touches Discord.** It is driven by a reconciler: desired state is computed from windows and manual holds, and compared with actual state on every sweep.

### 6.1 Data model

**`GuildConfig.examLocking`** (settings; edited with the existing draft/save pattern, defaults added in `migrateGuildConfigDocument`) plus a `features.examLocking` flag:

```js
examLocking: {
  staffBypassRoleKeys: ["admin", "dcHead", "srMods", "jrMods"],   // role keys (same set as /lock), resolved at runtime
  policy: {
    lockBufferMinutes: 60,
    unlockRule: "estimatedEnd",      // "keyTime" | "estimatedEnd" | "plus24h"
    unlockBufferMinutes: 30,
    extraTimePercent: 25,
    clusterGapHours: 24,
    mergeGapMinutes: 60,
    preLockWarningMinutes: 15,       // 0 = off
  },
  defaultKeyTimes: [ { zone: 1, session: "AM", utc: "17:00", dayOffset: 0 }, … ],  // the §2.3 ladder
  lockVoiceChannels: false,
  pendingReminder: { enabled: true, useSticky: true },
  logChannelKey: "modLog",
  subjects: [
    {
      id: "mathematics",                        // slug, stable (definitions-style)
      label: "Mathematics",
      syllabusCodes: ["9709", "9231"],
      channels:   [{ id: "…", label: "#maths" }, { id: "…", label: "#maths-forum" }],   // IdLabel[]
      categories: [{ id: "…", label: "MATHS" }],   // expanded to children at lock time
      enabled: true,
    },
  ],
}
```

- **Where subjects live:** in config, not a collection. There are a few dozen at most, and this reuses the `normalize*Config` + "can't delete while in use" patterns from Definitions.
- **Why not reuse Definitions subjects:** they lack syllabus codes and channels, and coupling the two features is undesirable. An optional `definitionSubjectId` link can be added later.

**`ExamSeries`** (new collection, replaces `ExamSession`):

```js
{
  guildId, board: "caie", season: "FM" | "MJ" | "ON", year: 2027, name: "May/June 2027",
  status: "draft" | "active" | "archived",   // draft = compiled + previewable, not executed
  keyTimes: [ { zone, session, utc, dayOffset } ],   // copied from defaults at creation, editable
  enabledZones: [1, 2, 3, 4, 5, 6],
  policy: { …same keys as above, all optional overrides… },
  sources: [ { zone, label: "Version 1, April 2026", importedAt, importedBy, rowCount } ],
  createdBy, updatedBy, rev, timestamps
}
```

**`ExamTimetablePaper`** (new model and collection `examtimetablepapers`, one per logical paper per series).

It deliberately does **not** reuse v1's `ExamPaper` or `exampapers` for two reasons. Phase 0 puts about 140 v1 documents there that must keep working until 13 Nov. And a unique index on fields those documents lack would fail to build.

```js
{
  guildId, seriesId, syllabusCode: "9709", paperKey: "9709-1", title: "Pure Mathematics 1",
  sittings: [
    { zone: 3, component: "12", localDate: "2026-09-30", session: "AM",
      durationMinutes: 110, keyAt: Date, keyAtOverride: Date | null },
  ],
  channelOverride: { add: [IdLabel], remove: [channelId] },
  windowOverrides: [ { clusterKey, lockAt?, unlockAt?, cancelled?, note?, by, at } ],
  // a clusterKey that no longer matches after a re-import is shown as an "orphaned override" warning, never dropped silently
  excluded: false,
  updatedBy, rev
}
// unique { seriesId, paperKey }
```

**`ExamLockWindow`** (compiled output, one per cluster; the bot reads, the web writes):

```js
{
  guildId, seriesId, paperId, syllabusCode,
  clusterKey,                     // stable: first component + first keyAt, so overrides survive recompiles
  clusterIndex, clusterCount,     // "cluster 1 of 2"
  label: "9709 Paper 1", zones: [1, 2, 3, 4], components: ["9709/11", "9709/12"],
  firstKeyAt, lastKeyAt, lockAt, unlockAt,
  pendingLater: [ { zones: [5, 6], firstKeyAt } ],
  status: "scheduled" | "active" | "done" | "cancelled" | "missed",   // bot-maintained, informational
  activatedAt, endedAt, compiledRev
}
// indexes { guildId, status, lockAt }, { guildId, status, unlockAt }, { seriesId }
```

**`ChannelLock`** (one per channel that is, or recently was, locked; the heart of the fix):

```js
{
  guildId, channelId, channelType,
  state: "unlocked" | "locking" | "locked" | "unlocking" | "error",
  examWindowIds: [ObjectId],          // windows covering it right now (for notices and status)
  manualHolds: [ { actionId, userId, reason, at } ],
  forceOpen: { by, reason, until } | null,   // suppresses exam locking until `until`
  mask: "<bigint string>",
  snapshot: {                          // written BEFORE the first Discord write, only on unlocked→locking
    capturedAt, wasSynced, parentId, parentOverwritesHash,
    targets: [ { id, type, existed, allow, deny } ]   // full prior bitfields
  },
  applied: [ { id, type, allow, deny, touched } ],  // exactly what we wrote; `touched` = the bits we changed on this target
                                                    // (the mask for @everyone/roles/staff; View|Send|Embed|History for the bot)
  notice: { messageId, warningMessageId, warnedForIntervalStart },
  lastError, attempts, nextAttemptAt, lastVerifiedAt, version
}
// unique { guildId, channelId }
```

**`ChannelDirectory`** (one doc per guild, published by the bot):

- **Why it exists:** the dashboard can't list live guild channels today; the pickers only offer GuildConfig registries.
- **Contents:** `{channels: [{id, name, type, parentId, position}], roles: [{id, name}], botIsAdmin, audit: {[channelId]: {allowingRoleIds, allowingMemberIds, botCanManage, missingBits, synced}}, updatedAt}`.
- **When it's written:** on ready, and debounced on `channelCreate`/`channelUpdate`/`channelDelete`/`roleUpdate`.
- **What it powers:** real channel pickers and the **preflight warnings** in the dashboard.

**`ExamLockAction`** (the dashboard's command queue to the bot; the web inserts, the bot consumes):

```js
{ guildId, channelId?, action: "forceOpen" | "retry" | "releaseManual", reason, by,
  status: "pending" | "done" | "failed", result, createdAt, doneAt }
```

The reconciler processes pending actions at the start of every sweep. The wake endpoint makes that immediate; without it, actions wait at most 60 s. This keeps the bot the **only** writer of `ChannelLock`.

`ExamSession`, `ExamPaper`, `examWindows.js`, `utils/channelLock.js` and the `/api/exam-sessions` routes are deleted **at cutover** (§7), not before.

### 6.2 Compile step (web)

- **Implementation:** `compileSeries(series, papers, policy)` in `packages/shared/src/examSchedule.js` is pure and deterministic. It uses `Intl` for display only; there are no dependencies.
- **When it runs:** every write that affects times (import commit, sitting edit, window override, series key-time or policy change, guild policy change) calls a `recompile(seriesId)` helper in `apps/web/src/lib/examCompile.ts`. The helper:
  - upserts windows by `(paperId, clusterKey)`
  - deletes `scheduled` windows no longer produced
  - updates times on `active` windows (extending takes effect immediately; shortening is picked up by the reconciler)
  - never touches `status`/`activatedAt`
- **Archiving a series** marks its future windows `cancelled`. Active windows finish normally unless force-opened.
- **Race-free by construction:** windows carry no execution state that the web can clobber. The bot never writes window times. The web never writes `ChannelLock`; it only inserts `ExamLockAction` commands.

### 6.3 Bot: reconciler and lock engine

**Reconciler** (rewrite of `apps/bot/systems/examLockSystem.js`, keeping its adaptive scheduler skeleton):

1. **Process pending `ExamLockAction`s**, then **load the relevant windows:**
   - `guildId` matches
   - (the series is `active` **or** the window's own `status` is `active`), so archiving a series mid-exam doesn't reopen channels early
   - the window isn't `cancelled`
   - `lockAt − 1 day ≤ now ≤ unlockAt + mergeGap`
2. **Load every `ChannelLock`** that is not `unlocked` or has manual holds.
3. **For each relevant channel, compute the desired state:**
   ```
   examWanted   = now ∈ mergedIntervals(channel) and not (forceOpen and now < forceOpen.until)
   desired      = examWanted or manualHolds.length > 0
   ```
4. **Act,** with a pool of 5 channels in parallel:

   | Actual state | Desired: locked | Desired: unlocked |
   |---|---|---|
   | `unlocked` | acquire | no-op |
   | `locking` | resume acquire | **switch to `unlocking`** and release from the persisted snapshot/applied |
   | `locked` | verify (at most every 5 min) | release |
   | `unlocking` | switch back to `locking` (the snapshot is still stored) | resume release |
   | `error` | retry acquire after backoff | **release** from the persisted snapshot/applied |

   Whatever fails, a channel whose windows have ended always heads towards `unlocked`. A target that keeps failing (e.g. 50013 on a staff allow) can't keep the `@everyone` deny in place past the window.

5. **Housekeeping:**
   - send pre-lock warnings that are due
   - update window `status` (`active` on the first sweep inside the window; `done` after; `missed` if it ended without ever being active, which raises a modLog alert)
   - refresh pending reminders
6. **Schedule the next sweep** at the earliest of: the next lockAt/unlockAt/warnAt, retry backoffs, and 60 s.
   - Rescheduling is wrapped in try/catch with a fallback timer, which fixes v1's unhandled rejection.
   - An in-flight guard means a wake during a sweep sets a "rerun" flag instead of starting a second sweep.
   - `client.isReady()` and the feature flag are checked.

Also: a debounced `channelUpdate` listener runs **verify** for managed channels, and `POST /internal/exam-lock/wake` on `commandSyncServer.js` triggers an immediate sweep. Use a timing-safe secret compare, which fixes the current `!==`.

**Lock engine** (`apps/bot/utils/channelLockEngine.js`; replaces `utils/channelLock.js`):

- **`acquire(channelId)`**
  1. CAS `state: unlocked → locking` with `version`.
  2. `channels.fetch(id, {force: true})` and choose the mask by channel type.
  3. **If there's no snapshot, capture every overwrite's full bitfields**, plus `wasSynced` and the parent's overwrites hash, and **persist it before any write**.
  4. Compute the targets:
     - `@everyone`: `deny |= mask`, `allow &= ~mask`
     - every non-staff role or member overwrite with `allow & mask`: `allow &= ~mask`
     - staff bypass roles (resolved from role keys, skipping Administrator roles): `allow |= mask`
     - the bot, if not Administrator: allow `ViewChannel | SendMessages | EmbedLinks | ReadMessageHistory`
  5. Persist `applied`, then PUT only the targets that differ, with an audit-log reason such as `Exam lock: 9709 Paper 1 (Zones 1–4)`.
  6. `state = locked`, then post or refresh the notice.
- **`release(channelId)`**
  1. CAS `locked → unlocking`, then fetch fresh.
  2. For each target in `snapshot ∪ applied`, and for each bit in **that target's `touched` bits**: `cur == ours ? base : cur`. Untouched bits are never changed. Any drift is collected and logged. Because the restore uses each target's own touched bits, it also removes the bot's own View/Send/Embed/History allow. With a mask-only restore that allow would linger and the channel would never re-sync with its category.
  3. If the result is empty and `!existed`, DELETE the overwrite; otherwise PUT it if it changed.
  4. If `wasSynced`, there was no drift, and the parent's overwrites changed during the lock, call `channel.lockPermissions()` to re-sync.
  5. Edit the notice to "Reopened", clear `snapshot`/`applied`, and set `state = unlocked`.
- **`verify(channelId)`**
  - Recompute from the live overwrites. If anything allows mask bits for non-staff, or `@everyone` isn't denied, re-apply.
  - A **new** overwrite that appeared during the lock is added to the snapshot with its current state as its base, then neutralised.
  - Corrections are logged, rate-limited.
- **Crash safety:**
  - `locking`/`unlocking` are resumable because each step compares against the stored `snapshot`/`applied`, never against live state as a baseline.
  - The engine **never re-snapshots** while a snapshot exists. Doing so would capture our own deny as the "original".
- **Errors:** a 403, a missing channel or missing permissions sets `lastError` and exponential backoff through `nextAttemptAt` (avoids 403 storms), and sends one modLog alert per channel per window. A deleted channel drops its `ChannelLock`.

### 6.4 Manual `/lock`, `/unlock`, `/lock-status`

All three commands go through the engine, so manual and exam locks compose.

- **`/lock channel reason`**
  - Adds a manual hold and acquires the lock.
  - Replies with any exam windows that also cover the channel.
- **`/unlock channel reason [force]`**
  - Removes manual holds.
  - If an exam window still covers the channel, it replies *"Still exam-locked for 9709 Paper 1 until <t:…:F>"* and leaves it locked.
  - `force:true` (restricted to senior roles in `commandPermissions`) sets `forceOpen` until the end of the current merged interval, releases the lock, and logs an override.
- **`/lock-status`**
  - Rebuilt on `ChannelLock`: shows each locked channel with its reason (exam papers or manual, by whom) and when it reopens (`<t:…:R>`). It is paginated, with no hard-coded "permanent" channel list.
  - Exam-covered channels in the next 24 h are shown as upcoming.
  - Its default permission is aligned with `/lock` (`BanMembers`), which also fixes the todo item "/lock-status not working" (audit L1).

### 6.5 Notices and reminders

All times use `<t:unix:F> (<t:unix:R>)` so every member sees their own local time. Timestamps render in embed descriptions and fields, but not in titles or footers.

| When | What |
|---|---|
| `interval start − 15 min` | **Pre-lock warning:** "🔔 This channel becomes read-only <t:…:R> for **9709 Paper 2, Paper 4** (all zones). It reopens <t:…:F>." |
| Lock | **Lock notice** (one message, edited as windows extend or join): "🔒 Read-only for exams: 9709 Paper 2 (Zones 1–4) · 9709 Paper 4 (Zones 1–4). Reopens <t:…:F> (<t:…:R>). Please don't discuss these papers anywhere on the server or in DMs." The pre-lock warning is deleted |
| Unlock | The lock notice is **edited** to "🔓 Reopened <t:…:t>", plus pending reminders if any. No second message |
| Between clusters | **Pending reminder:** "⏳ Still to be sat: **9709 Paper 1** by Zones 5 & 6 on <t:…:F>. Please don't discuss it until then." |
| Any transition | **modLog:** one embed per sweep batch listing the channels, papers, reopening time, failures and drift. It is also a ModLog document per channel for the audit trail. The v1 `channelTag` field is dropped because it isn't in the schema |

**Keeping the pending reminder visible:**

- It is re-computed at every transition for each channel, as the list of later clusters of papers mapped to it whose first key time is still in the future.
- If the channel has **no sticky of its own**:
  - The engine creates a `Sticky` with a new `owner: "exam-lock"` field and updates the cache through `upsertStickyCache`. The existing sticky system then re-posts it after N messages.
  - When nothing is pending, the engine deletes the sticky **and its last posted message**, then calls `removeStickyCache`.
  - `/add-sticky` (and the dashboard sticky page) must **set `owner: "human"` on every upsert**. Otherwise a mod who later replaces the reminder with their own sticky would have it deleted by the engine. The engine only ever deletes stickies with `owner: "exam-lock"`.
- In these cases the reminder appears only in the reopen notice and in `/exam-schedule`:
  - the channel already has a human-configured sticky (the model allows one per channel)
  - the channel is a **forum**: stickies never fire there, because messages arrive in threads, not in the forum itself

### 6.6 `/exam-schedule`

- **Options:** `subject` (autocomplete from `examLocking.subjects`; defaults to the subject of the channel it's run in) and `days` (default 14).
- **Reply:** ephemeral. It shows the current state (locked until …, or open), upcoming read-only periods as `<t:F> – <t:t> (<t:R>)` with paper labels and zones, and pending reminders.
- **Access:** everyone. It is registered through the usual command catalog and permissions flow (`docs/adding-commands.md`).

### 6.7 Dashboard

**Settings → Exam locking** (GuildConfig, draft + `SaveActions`):

- the feature toggle and staff bypass roles (`RolePicker`)
- timing policy, with inline explanations of each number, and an `unlockRule` preset picker
- the default key-time ladder: a 6 × 3 grid, with a live preview such as "Zone 4 AM = 10:00 PKT / 10:30 IST"
- **subjects:** label, syllabus codes, channels and categories (pickers backed by `ChannelDirectory`), enabled. Each channel shows **preflight badges**:
  - ⚠ role "Physics" allows Send (will be neutralised during locks)
  - ⛔ bot can't manage this channel
  - forum / voice / category-expanded

**Operations → Exam timetable** (replaces Operations → Exam locking):

- **Series list:** create a series (name, season, year). This copies the ladder and policy. Status chips show draft, active and archived.
- **Series page, in tabs:**
  1. **Overview.** Activate, archive and recompile controls. Stats. **Warnings:**
     - syllabuses with no mapped channels
     - channels failing preflight
     - windows longer than 24 h
     - papers split into several clusters, listed with their gaps
     - sittings in disabled zones
  2. **Import.** Paste or upload → parse → **preview**:
     - rows per zone, errors, warnings
     - **a diff against the current data**: added, changed and removed sittings, matched on `(zone, syllabus, component)`
     - "A Level only" filter, on by default. It filters on **syllabus codes 8xxx/9xxx**, not the qualification column, which parsing sometimes leaves blank

     Then **Commit**, which records `sources[]`.
  3. **Papers.** Grouped by subject. Each paper shows a zones × date/session matrix, its compiled windows (in the admin's local time with UTC on hover) and their status. Actions:
     - edit a sitting
     - split or merge paper groups
     - extend, shorten or cancel a window (stored as `windowOverrides`)
     - per-paper channel override
     - exclude
  4. **Schedule.** A per-channel timeline of *merged* read-only intervals, filterable by subject, with a timezone selector. This is the view admins sanity-check before activating.
  5. **Key times.** The per-series ladder editor, e.g. the Romania-in-March case.

**Operations → Exam locks (live):**

- **What it shows:** `ChannelLock` docs that are locked, locking, errored or have holds, with their reasons and reopening times, plus the next 24 h of intervals and recent history.
- **Actions:** force open (until the end of the interval, with a reason), retry now, and release a manual hold. Each action inserts an `ExamLockAction`, which the bot executes; the page shows it as pending until then.
- **Refresh:** it auto-refreshes every 15 s. Actions also call the wake endpoint, so they take effect in seconds, not 60 s.

**Access:** API routes follow the existing pattern (`requireAllowlistedAuth`, zod, `GUILD_ID` scoping, conditional updates), and record `createdBy`/`updatedBy` from `authResult.email`, which v1 ignored. Planned routes:

- `/api/exam/series`
- `/api/exam/series/[id]`
- `/api/exam/series/[id]/import` (`?dryRun=1` for the preview)
- `/api/exam/papers/[id]`
- `/api/exam/locks`
- `/api/exam/locks/[channelId]/actions`

### 6.8 Import format

CSV or TSV (a paste straight from a spreadsheet works), with a header row. Column names are case-insensitive and aliases are accepted:

| Column | Aliases | Example | Notes |
|---|---|---|---|
| `zone` | | `4` | 1–6 |
| `syllabus` | | `9709` | optional if `component` is `9709/12` |
| `component` | `code` | `12` or `9709/12` | |
| `title` | `name` | `Pure Mathematics 1` | optional |
| `date` | `local_date` | `2026-10-13` | **the local date printed in that zone's timetable**; `dd/mm/yyyy` also accepted |
| `session` | | `AM` | AM / PM / EV |
| `duration` | | `1h 50m` or `110` | |
| `qualification` | `qual` | `AS` | optional, informational (the A Level filter uses the syllabus code) |
| `weekday` | | `Tuesday` | optional but strongly recommended; checked against `date` |

The research CSV's header (`series,zone,source_pdf,qual,syllabus,component,paper_number,variant_digit,name,local_date,session,duration,key_time_utc`) is accepted as-is.

**Errors** (block commit):

- bad zone, session, date or duration
- `EV` in a zone with no EV key time
- the same `(zone, component)` twice with different dates
- **weekday mismatch.** The Nov 2026 Zone 6 typo affects 8238/23 and 9482/13, where Zone 6 is the *last* sitting. Importing it as 7 October would end the lock before Zone 6 sits and expose them. The admin fixes the date in the CSV

**Warnings** (shown in the preview, don't block):

- no `weekday` column, so date typos can't be detected (the CSV helper always includes it)
- a date outside the series' usual months
- a syllabus with no mapped subject
- non-A Level rows skipped
- a cluster window longer than 24 h
- a zone appearing twice in one cluster, or a later cluster made only of zones that already sat the paper. Both suggest the group holds two papers
- one component sat at several different instants (informational)

**Getting a CSV:** a helper script `apps/bot/scripts/cambridge-timetable-to-csv.py` productionises `parse_week.py`. Give it the six zone PDFs and it runs `pdftotext`, validates weekdays and writes the import CSV. A dev runs it; the dashboard never parses PDFs. Cambridge Direct's CSV works too if an admin has centre access.

### 6.9 Failure modes

| Scenario | Behaviour |
|---|---|
| Bot down at lockAt | The first sweep after start locks immediately if the interval is still running |
| Bot down for a whole window | Window marked `missed`; modLog alert on startup |
| Crash mid-lock or mid-unlock | `ChannelLock.state` is `locking`/`unlocking`; resumed from the stored snapshot/applied, never re-snapshotted |
| Admin edits permissions during a lock | `verify` re-asserts the lock bits; release keeps the admin's other changes and any drift, and logs it |
| New role overwrite allowing Send appears mid-lock | `verify` adds it to the snapshot with its current state as base, then neutralises it |
| Series archived, or set back to draft, mid-window | Windows already `active` run to their end; only future windows are cancelled |
| One target keeps failing (e.g. 50013) | Channel sits in `error` with backoff and an alert. When its windows end it is released from the persisted state, so it never stays locked indefinitely |
| Manual `/lock` during an exam, or vice versa | Separate holds; the channel reopens only when both are gone |
| Manual `/unlock` during an exam | Refused unless `force`; force sets a logged `forceOpen` |
| Overlapping or back-to-back windows | Merged per channel; one snapshot, one notice |
| Timetable revised mid-series | Re-import → diff → recompile. Extensions apply immediately; shortening releases at the next sweep |
| Channel deleted | Its `ChannelLock` is dropped; dashboard warning |
| Bot lacks permission | Flagged by preflight days ahead. At lock time: `lastError`, backoff, one alert |
| Dev bot or verify script on the production DB | Every query filters `guildId`, and CAS on `ChannelLock.version` prevents double application |
| DST changes mid-series | Not applicable: all instants are UTC; members see local times through `<t:…>` |
| Rate limiting | Pool of 5 channels, discord.js queue; `client.rest.on("rateLimited")` is logged |

---

## 7. Implementation plan

### Right now, until Phase 0 is live: manual rota

There are lock windows almost every day from today, and Phase 0 needs a few days to build and rehearse. So mods cover the gap by hand:

- **Rota:** use `/lock` and `/unlock` on the subject channels, following **Appendix A**. It is generated from the timetable, one row per subject with overlapping papers merged. Only rows for subjects the server has channels for matter.
- **Reminder to post by hand:** in #maths, *"9709 Paper 1 — Zones 5 & 6 sit it on 13 Oct 01:00 UTC. Please don't discuss Paper 1 until then."* (Zones 1–4 sat it today.) 9701 Paper 3 needs no reminder: its 27 Oct date is the separate "Practical 2" paper (§5.3 step 4).
- **Known limits:** manual `/lock` only denies `SendMessages` on `@everyone`, so threads and forum replies stay open, and any role allow bypasses it (§3.1). Until Phase 0, mods should also watch threads in locked channels.

### Phase 0: Nov 2026 stopgap (about 3–4 days)

The goal is to protect the remaining Nov 2026 A Level windows safely, with v1's sweeper and a minimal set of changes. **Manual `/lock` and `/unlock` stay exactly as they are.** The exam system gets its own lock primitive, so the wider mask and the restore logic never affect manual commands or unaudited channels.

| Step | Change | Files |
|---|---|---|
| 0.1 | **Preflight audit script** (read-only). Reads the subject → channel map. For each channel it reports:<br>• type<br>• any explicit `@everyone` value on the lock bits<br>• role and member overwrites that allow lock bits<br>• whether the bot is Admin or has `ManageRoles` plus the lock bits **in the guild or the parent category**<br>• parent category overwrites<br>• sync status<br><br>Mods fix what it flags **before the import**, e.g. by making subject-role overwrites View-only. Phase 0 does not neutralise role allows automatically | `apps/bot/scripts/audit-exam-channels.js`, `apps/bot/data/exam-subject-channels.json` |
| 0.2 | **Exam-only lock primitive** with a snapshot (a subset of the v2 engine, reusable later).<br><br>**Lock:**<br>1. Fetch the channel fresh.<br>2. **Save a snapshot on the paper before writing:** `{existed, allow, deny}` for `@everyone`, each staff role (`admin`, `dcHead`, `srMods`, `jrMods`) and the bot.<br>3. Apply: `@everyone` deny the lock mask (`SendMessages`, `SendMessagesInThreads`, `CreatePublicThreads`, `CreatePrivateThreads`, `AddReactions`); staff roles allow the mask; the bot allows View/Send/Embed/History if it isn't Admin.<br>4. Record `applied` with its `touched` bits.<br>5. If any *non-staff* role or member overwrite still allows a lock bit, send a modLog alert.<br><br>**Unlock:** a per-bit 3-way restore over the touched bits (`cur == applied ? snapshot : cur`). Delete overwrites that didn't exist before and are now empty | `apps/bot/utils/examChannelLock.js` (new), `packages/db/src/models/examPaper.js` (+ `lockSnapshot`, `lockApplied`: Mixed) |
| 0.3 | **Sweeper hardening:**<br>• `guildId: process.env.GUILD_ID` on every query<br>• skip sweeps until `client.isReady()`<br>• try/catch around `scheduleNextSweep` with a fallback timer<br>• **a failed lock keeps the paper `scheduled`**, with `attempts`/`nextAttemptAt` backoff and a modLog alert<br>• **a failed unlock keeps it `locked`** and retries<br>• if a window ends while its lock never succeeded, mark the paper `unlocked` with `lastError`<br>• notices use `<t:…:F> (<t:…:R>)` | `apps/bot/systems/examLockSystem.js`, `examPaper.js` (+ `attempts`, `nextAttemptAt`, `lastError`) |
| 0.4 | **Pending reminder:** add an optional `unlockNote` to `ExamPaper` and append it to the unlock embed | `examPaper.js`, `examLockSystem.js` |
| 0.5 | **Protect imported papers from the dashboard:**<br>• add `imported: true`<br>• the session PATCH recompute loop skips imported papers (`[id]/route.ts:136-161`)<br>• the paper PATCH refuses anything except cancel and force-unlock for them | `examPaper.js`, `apps/web/src/app/api/exam-sessions/[id]/route.ts`, `[id]/papers/[paperId]/route.ts` |
| 0.6 | **Bulk import script**, `--csv … --map … [--dry-run] [--shift-minutes N]`:<br>• filters syllabus 8xxx/9xxx and groups and clusters exactly as in §5.3<br>• resolves channels, then **merges intervals per channel** (§5.4)<br>• creates **one v1 paper per (channel, merged interval)**. A channel is then never covered by two v1 papers at once, which keeps the per-paper snapshot safe<br>• **labels** combine the papers, e.g. "9709 Paper 2 + Paper 4 (Zones 1–4)"<br>• **`unlockNote`** is filled from `pendingLater`<br>• **required v1 fields:** one session "Nov 2026 (imported)" with nominal valid times; `date` = UTC date of `lockAt`; `slot` = AM/PM from the UTC hour (cosmetic). EV sittings need no special handling because times are set directly<br>• sets `lockAt`/`unlockAt` directly<br>• **past and running windows:** skips ended windows; a window already running gets `lockAt = now`<br>• idempotent on `channelId + lockAt`<br>• `--dry-run` prints the schedule for mods to check against Appendix A | `apps/bot/scripts/import-exam-windows-v1.js`, `apps/bot/data/exam-timetables/november-2026.csv` |
| 0.7 | **Rehearsal** on the dev guild. **Use a separate database**, or deploy 0.3's `guildId` filter to production first; otherwise the production sweeper grabs the rehearsal papers. `--shift-minutes` moves a few windows into the next hour on a test channel. Check:<br>• lock applied, notice posted<br>• threads and forum replies blocked<br>• staff can post<br>• unlock restores the original overwrites and the category sync | — |

**Deploy order:**

1. Deploy 0.2–0.5.
2. Run the 0.1 audit and fix what it flags.
3. Run the import with `--dry-run`; mods review it.
4. Run the real import.
5. Stop the manual rota for the imported channels.

**Operating rules for mods until cutover:**

- **Never change the imported session's times, and never delete that session.** 0.5 protects the papers, but these are the actions that would destroy them.
- **Cancel and force-unlock** from the dashboard are fine.
- **Don't run `/lock` or `/unlock` on a channel that is exam-locked.** Manual commands still use v1's old logic and would fight the snapshot.
- Watch modLog for alerts after the first few locks.

### Cutover: v1 → v2 (on or after 14 Nov 2026)

- **Nothing from Phases 2–4 that changes runtime behaviour reaches production before the last Nov 2026 window has ended.** That covers the rewritten `/lock`/`/unlock`/`/lock-status`, the new reconciler, and deleting `channelLock.js`.
- Phase 1 and new, unwired code can merge at any time.
- **At cutover:**
  1. Confirm no v1 paper is `locked`.
  2. Stop the v1 sweeper.
  3. Run the clean-up script, which deletes `examsessions`/`exampapers`.
  4. Deploy v2.
  5. Run a one-off `verify` sweep over the subject channels.

### Phase 1: scheduling core (pure) — about 2–3 days

- **Library:** `packages/shared/src/examSchedule.js` (+ `.d.ts`, exported from `packages/shared/index.js`) with:
  - `DEFAULT_KEY_TIMES`
  - `computeKeyAt`
  - `groupIntoPapers`
  - `clusterSittings`
  - `computeWindow` (all three `unlockRule`s)
  - `mergeIntervals`
  - `compileSeries`
  - `parseTimetableCsv`
  - `diffSittings`
  - display helpers (`Intl`)
- **Tests:** `apps/bot/scripts/verify-exam-schedule.js` in the pure-stub style of `verify-definitions.js`, with a committed Nov 2026 fixture (9709, 9701, 9702, 9274) and golden assertions. For example:
  - 9709 produces 12 windows
  - P1 cluster 2 is Zones 5–6, locking at 2026-10-13T00:00Z, and P1 cluster 1 has `pendingLater` for Zones 5–6
  - 9274 P3 is one 35 h cluster
  - 9702 P3's 22 Oct cluster is flagged "second sitting" with no reminder
  - 8679/02 and /03 are Papers 2 and 3, not "Paper 0"
  - no component code is split across clusters
  - Zone 6 AM gets `dayOffset −1`, and EV sittings use the EV key time
  - a weekday typo is an **error**
  - the whole-series totals match §2.5: 164 Nov windows, 25 split papers

### Phase 2: lock engine — about 3–4 days

- **Model:** `packages/db/src/models/channelLock.js`.
- **Engine:** `apps/bot/utils/channelLockEngine.js`: masks per type, snapshot, `acquire`/`release`/`verify`, CAS, backoff. It grows out of Phase 0's `examChannelLock.js`, which already has the snapshot and touched-bits restore; this adds role and member neutralisation, the lease and the state machine.
- **Commands:** rewrite `/lock`, `/unlock` (add `force`) and `/lock-status` on the engine, and delete `utils/channelLock.js`. **These ship at cutover, not before** (§7 Cutover).
- **Tests:** `verify-channel-lock-engine.js` with a mocked overwrite manager. Cases:
  - a role allow is neutralised
  - staff get an allow
  - the bot self-allows when not Admin
  - an exact restore brings the channel back to synced
  - drift is kept
  - an overwrite we created is deleted
  - resume from `locking`
  - manual + exam holds
  - `force` open
  - 403 backoff

### Phase 3: models, compile, reconciler — about 3–4 days

- **Models (all new collections):**
  - `examSeries.js`
  - `examTimetablePaper.js`
  - `examLockWindow.js`
  - `examLockAction.js`
  - `channelDirectory.js`
  - At cutover, delete `examSession.js`, `examPaper.js` and `examWindows.js`.
- **Config:** `GuildConfig.examLocking`, `features.examLocking`, migration defaults and `normalizeExamLockingConfig`, wired into `PUT /api/config`.
- **Compile:** `apps/web/src/lib/examCompile.ts` (recompile + upsert).
- **Bot:**
  - rewrite `systems/examLockSystem.js` as the reconciler
  - notices and warnings
  - pending-reminder stickies (add `owner` to the `Sticky` model)
  - `systems/channelDirectory.js`
  - the wake route on `commandSyncServer.js`
- **Data:** a clean-up script that deletes v1 `examsessions`/`exampapers` at cutover. It refuses to run while any v1 paper is `locked`.

### Phase 4: dashboard — about 4–5 days

- **Pages:**
  - Settings → Exam locking
  - Operations → Exam timetable (list + series tabs)
  - Operations → Exam locks (live)
- **Also:** API routes, and `nav.ts` entries. Remove `/ops/exam-locking` and `/api/exam-sessions/**`.

### Phase 5: `/exam-schedule`, tooling, docs — about 1–2 days

- **Command:** `apps/bot/commands/…/exam-schedule.js` plus catalog/permissions registration.
- **Tooling:** `apps/bot/scripts/cambridge-timetable-to-csv.py`.
- **Docs:** add the new system to `docs/systems.md`, `commands.md`, `database.md` and `architecture.md` (exam locking is currently undocumented).
- **Data:**
  - import March 2027 (Zone 4 only; Romania uses Zone 4 key times anyway)
  - import June 2027 once the final timetable is public (end of Oct 2026)

**Target:** v2 live and rehearsed on the dev guild **before 3 Feb 2027** (March series). With the phase estimates above, that's comfortable.

---

## 8. Testing strategy

- **Pure unit tests** (Phases 1–2): the schedule library and the engine, run against stubs, following the `verify-*.js` convention (`pnpm --filter @ralevel/bot verify:<name>`). They don't touch Mongo or Discord.
- **Golden data test:** compile the committed Nov 2026 A Level fixture and compare the window count, the longest window and specific windows against §2.5 and §5.5.
- **Dev-guild rehearsal:** a series with sittings shifted into the next hour. Checklist:
  - [ ] Text channel: `@everyone` can't send, react, or reply in an existing thread.
  - [ ] Forum: can't post or reply.
  - [ ] A role overwrite that allowed Send is neutralised, then restored.
  - [ ] Staff role can post.
  - [ ] Pre-lock warning, lock notice, and reopen edit all appear.
  - [ ] Pending sticky appears.
  - [ ] Unlock leaves the channel **synced with its category** again.
  - [ ] Kill the bot mid-lock; restart; it resumes.
  - [ ] Manual `/lock` survives an exam unlock.
- **Do not reuse the v1 verify script's pattern** of logging into Discord against the shared DB with a global sweep (audit L6).

---

## 9. Verify on the live server before Phase 0 goes live

1. **Is the bot Administrator?**
   - If not, does it have `ManageRoles` plus every mask bit, in the guild or in each subject channel's parent category?
   - Does the server enforce 2FA for moderation? If so, the bot owner's account needs 2FA.
2. **Run the 0.1 audit on every subject channel.** Are there role overwrites (subject roles, Verified, helpers) that allow `SendMessages`/`SendMessagesInThreads`? This is the single most likely way the lock silently fails.
3. **Channel types:** which subject channels are forums, which use threads heavily, and are there subject voice channels?
4. **Staff bypass:** confirm the role keys that should bypass locks. The proposal is the `/lock` set: `admin`, `dcHead`, `srMods`, `jrMods`. Should helpers (`srHelper`, `jrHelper`) also be included?
5. **Stickies:** do subject channels already have stickies? That decides whether the pending reminder can use a sticky.
6. **Production environment:** are `SYNC_HTTP_PORT` + `INTERNAL_SYNC_SECRET` + `BOT_INTERNAL_SYNC_URL` set? The wake endpoint needs them; without them we fall back to the ≤60 s poll.
7. **Production Mongo:**
   - before the Phase 0 import, confirm there are no v1 exam documents
   - confirm no other process with a different `GUILD_ID` uses the same `MONGO_URI` (audit H4); if the dev bot does, rehearse on a separate database
8. **Subject → channel map:** which Discord channels belong to which syllabus codes? This is the input to the 0.1 audit and the 0.6 import (`apps/bot/data/exam-subject-channels.json`).

---

## 10. Open questions and future options

- **Buffers:** are 60 min before, 30 min after, and 25% extra time the right defaults? All are configurable per guild and per series.
- **Pending reminder wording:** also whether it should mention *which* variant has already been sat. The current proposal names only paper and zones, to avoid encouraging variant talk.
- **AutoMod "leak guard" (not chosen now):** one Discord AutoMod keyword rule, rewritten at each window with the active paper codes (e.g. `9709/12`, `9709 p1`), blocking server-wide including #general and threads. It's cheap, but easy to evade. It also misses bot-relayed text such as confessions, which would need an in-bot check during windows. Worth revisiting if leaks move to general channels.
- **IGCSE / O Level:** the model already works for 0xxx syllabuses. Turn off the A Level import filter and map the channels.
- **Other boards (Pearson Edexcel IAL):** one global sitting per paper, with country start times in UK time and ±30 min flexibility. `ExamSeries.board` plus a board-specific key-time table would cover it.
- **Scheduled events:** Discord "external" events per slot as a native exam calendar. They are capped at 100 active, so they'd need a rolling 7–14 day horizon.
- **Zone roles:** let members pick their zone, so `/exam-schedule` can say "your zone sits this at …". Cambridge assigns zones by country or state, not by UTC offset, so this needs a country picker.
- **Windowed components** (speaking tests, coursework): currently ignored. They would need date-range locks to the end of the assessment window.

---

## 11. Key sources

- **Cambridge Handbook 2026** (key times, Full Centre Supervision, deviations, §5.3.2 discussion rule): https://www.cambridgeinternational.org/Images/746922-cambridge-handbook-2026.pdf
- **Information for candidates 2026:** https://www.cambridgeinternational.org/images/86457-information-for-candidates.pdf
- **Exam timetables** (zone PDFs): https://www.cambridgeinternational.org/exam-administration/cambridge-exams-officers-guide/phase-1-preparation/timetabling-exams/exam-timetables/
- **Key times tool:** https://www.cambridgeinternational.org/exam-administration/cambridge-exams-officers-guide/phase-1-preparation/timetabling-exams/key-times/
- **Administrative zones:** https://www.cambridgeinternational.org/exam-administration/cambridge-exams-officers-guide/phase-1-preparation/timetabling-exams/administrative-zone/
- **Variants explained:** https://help.cambridgeinternational.org/hc/en-gb/articles/29564314813970
- **March series (India and Romania):** https://www.cambridgeinternational.org/exam-administration/march-series/
- **Discord permissions and overwrites:** https://docs.discord.com/developers/topics/permissions
- **Discord threads:** https://docs.discord.com/developers/topics/threads
- **Discord rate limits:** https://docs.discord.com/developers/topics/rate-limits
- **discord.js permissions guide:** https://discordjs.guide/popular-topics/permissions-extended
- **Prior art:** r/IGCSE bot `/lockdown` (https://github.com/r-IGCSE/r-igcse-bot) and zombbblob's exam-lock role (https://github.com/zombbblob/zombbblob)

---

## Appendix A: Manual lock rota, Nov 2026, 30 Sep – 9 Oct

- **Source:** generated from the parsed timetable with the §5 rules (60 min before the first key time; the last key time plus 125% of the duration plus 30 min).
- **Merging:** overlapping papers of the same syllabus are merged into one row.
- **Times are UTC.** The first two rows started on 29 Sep.
- **Scope:** act only on subjects the server has channels for. Later dates come from `simulate_v2.py`, or from the Phase 0 import's `--dry-run`.
- **Labels:** "(1/2)" marks the first of two lock windows for a paper (see §5.3 step 4). When such a row unlocks, post the reminder listed under the table.

| Lock (UTC) | Unlock (UTC) | Syllabus | Papers |
|---|---|---|---|
| Tue 29 Sep 08:00 | Wed 30 Sep 04:00 | 9395 Travel & Tourism | P1 |
| Tue 29 Sep 16:00 | Wed 30 Sep 15:42 | 8021 English General Paper | P2 |
| Wed 30 Sep 00:00 | Wed 30 Sep 19:23 | 8027 German Language | P3 |
| Wed 30 Sep 00:00 | Wed 30 Sep 19:23 | 8028 French Language | P3 |
| Wed 30 Sep 08:00 | Wed 30 Sep 19:48 | 9709 Mathematics | P1 (1/2) |
| Wed 30 Sep 08:00 | Wed 30 Sep 23:42 | 8291 Environmental Management | P1 |
| Wed 30 Sep 08:00 | Wed 30 Sep 23:42 | 9694 Thinking Skills | P2 |
| Wed 30 Sep 08:00 | Thu 01 Oct 00:00 | 9897 German Language & Literature | P2 |
| Thu 01 Oct 04:00 | Thu 01 Oct 08:38 | 9686 Urdu | P4 |
| Fri 02 Oct 04:00 | Fri 02 Oct 23:23 | 9084 Law | P2 |
| Fri 02 Oct 08:00 | Fri 02 Oct 23:42 | 8291 Environmental Management | P2 |
| Fri 02 Oct 08:00 | Sat 03 Oct 00:00 | 9897 German Language & Literature | P3 |
| Fri 02 Oct 12:00 | Sat 03 Oct 03:42 | 8679 Afrikaans Language | P2 |
| Mon 05 Oct 00:00 | Mon 05 Oct 19:23 | 9395 Travel & Tourism | P3 |
| Mon 05 Oct 00:00 | Mon 05 Oct 19:42 | 9626 Information Technology | P1 |
| Mon 05 Oct 04:00 | Mon 05 Oct 07:23 | 8680 Arabic Language | P3 |
| Mon 05 Oct 04:00 | Mon 05 Oct 07:23 | 9680 Arabic | P3 |
| Mon 05 Oct 04:00 | Mon 05 Oct 15:04 | 9609 Business | P1 (1/2) |
| Mon 05 Oct 08:00 | Mon 05 Oct 11:23 | 9487 Hinduism | P1 |
| Tue 06 Oct 00:00 | Tue 06 Oct 20:00 | 9700 Biology | P3 (1/2) |
| Tue 06 Oct 04:00 | Tue 06 Oct 07:23 | 9686 Urdu | P3 |
| Tue 06 Oct 04:00 | Tue 06 Oct 16:00 | 9708 Economics | P2 (1/2) |
| Tue 06 Oct 04:00 | Tue 06 Oct 23:23 | 9084 Law | P3 |
| Wed 07 Oct 00:00 | Wed 07 Oct 19:23 | 9395 Travel & Tourism | P4 |
| Wed 07 Oct 04:00 | Wed 07 Oct 16:00 | 9231 Further Mathematics | P1 (1/2) |
| Wed 07 Oct 04:00 | Wed 07 Oct 23:23 | 9699 Sociology | P1 |
| Wed 07 Oct 08:00 | Wed 07 Oct 19:04 | 9709 Mathematics | P5 (1/2) |
| Thu 08 Oct 00:00 | Thu 08 Oct 20:00 | 9702 Physics | P3 (1/2) |
| Thu 08 Oct 04:00 | Thu 08 Oct 15:23 | 9609 Business | P2 (1/2) |
| Thu 08 Oct 04:00 | Thu 08 Oct 23:23 | 9084 Law | P4 |
| Thu 08 Oct 08:00 | Thu 08 Oct 19:23 | 9696 Geography | P1 (1/2) |
| Fri 09 Oct 04:00 | Fri 09 Oct 15:23 | 9231 Further Mathematics | P3 (1/2) |
| Fri 09 Oct 04:00 | Fri 09 Oct 15:23 | 9618 Computer Science | P1 (1/2) |
| Fri 09 Oct 08:00 | Fri 09 Oct 11:04 | 9701 Chemistry | P2 (1/2), P5 (1/2) |

**Reminders to post when a "(1/2)" row unlocks.** Suggested wording: *"Still to be sat: <paper> by Zones X on <date>. Please don't discuss it until then."* The date is the UTC key time of the zones' next sitting. Write it as a Discord `<t:…:F>` timestamp so everyone sees their local time.

| Paper | Zones still to sit it | When (UTC) |
|---|---|---|
| 9709 Paper 1 | 5, 6 | 13 Oct 01:00 |
| 9709 Paper 5 | 5, 6 | 15 Oct 01:00 |
| 9231 Paper 1 | 1, 6 | 12 Oct 17:00 |
| 9231 Paper 3 | 1, 6 | 14 Oct 21:00 |
| 9609 Paper 1 | 1, 6 | 11 Oct 21:00 |
| 9609 Paper 2 | 1, 6 | 13 Oct 17:00 |
| 9618 Paper 1 | 1, 6 | 13 Oct 17:00 |
| 9696 Paper 1 | 5, 6 | 19 Oct 01:00 |
| 9701 Paper 2, Paper 5 | 1, 2, 5, 6 | 16 Oct 01:00 |
| 9708 Paper 2 | 1, 6 | 12 Oct 17:00 |
| 9700 / 9701 / 9702 Paper 3 | none: the later date is the separate "Practical 2" paper, sat only by zones that already took Practical 1 | — |
