# Commands

All 72 slash commands in the r/alevel bot. There are **no prefix/text commands** — every user-facing command is a Discord slash command (`/`).

Commands are loaded at runtime from `commands/` and registered to Discord via `scripts/deploy-commands.js`.

---

## Permission model

Three layers apply before a command executes:

1. **Discord `setDefaultMemberPermissions`** — hides commands from users lacking Discord permission bits (e.g. `BanMembers`). Not all commands use this.
2. **Custom role gate** (`permissions.config.js`) — user must have at least one listed role ID. Commands **not listed** are public (any member can use).
3. **Role hierarchy** (`systems/commands.js`) — moderation commands cannot target users with equal or higher roles.

### Role group abbreviations

| Abbrev | Env variable |
|--------|-------------|
| admin | `ADMIN_ROLE_ID` |
| dcHead | `DC_HEAD_ROLE_ID` |
| gfxHead | `GFX_HEAD_ROLE_ID` |
| hlpHead | `HLP_HEAD_ROLE_ID` |
| generalStaff | `GENERAL_STAFF_ROLE_ID` |
| srMods | `SR_MOD_ROLE_ID` |
| jrMods | `JR_MOD_ROLE_ID` |
| trialMods | `TRIAL_MOD_ROLE_ID` |
| srHelper | `SR_HELPER_ROLE_ID` |
| designer | `DESIGNER_ROLE_ID` |
| trialDesigner | `TRIAL_DESIGNER_ROLE_ID` |
| ialAgent | `IAL_AGENT_ROLE_ID` |

### Known permission config bugs

| Config key | Actual slash name | Impact |
|------------|-------------------|--------|
| `set-nickname` | `setnickname` | Role gate not applied |
| `set-helper` | `sethelper` | Role gate not applied |
| *(missing)* | `softban` | No custom role gate |

---

## Applications

### `/apply`

| | |
|---|---|
| **File** | `commands/applications/apply.js` |
| **Description** | Get the r/alevel application form |
| **Discord permissions** | None |
| **Role access** | Public |
| **Hierarchy check** | No |
| **Dependencies** | Links to `https://ralevel.com/forms` |

---

## Certificates

### `/approve-certificate`

| | |
|---|---|
| **File** | `commands/certificates/approve-certificate.js` |
| **Description** | Approve a certificate application (admin only) |
| **Discord permissions** | `BanMembers` |
| **Role access** | admin (+ in-command `ADMIN_ROLE_ID` check) |
| **Hierarchy check** | No |
| **Dependencies** | `CertificateApplication` model, `REVIEW_CHANNEL`, `CERT_UPDATES_CHANNEL` |

### `/certificate-status`

| | |
|---|---|
| **File** | `commands/certificates/certificate-status.js` |
| **Description** | View certificate application status |
| **Discord permissions** | None |
| **Role access** | admin |
| **Dependencies** | `MOD_ROLES`, `ADMIN_ROLE_ID` |

### `/certificate-status-mod`

| | |
|---|---|
| **File** | `commands/certificates/certificate-status-mod.js` |
| **Description** | View certificate application status (mods) |
| **Discord permissions** | `BanMembers` |
| **Role access** | admin (+ in-command checks) |

### `/mark-cert-delivered`

| | |
|---|---|
| **File** | `commands/certificates/mark-cert-delivered.js` |
| **Description** | Mark a certificate as delivered |
| **Discord permissions** | `BanMembers` |
| **Role access** | admin |
| **Note** | Bug: uses `REVIEW_CHANNEL` instead of `CERT_UPDATES_CHANNEL` for updates |

### `/reject-certificate`

| | |
|---|---|
| **File** | `commands/certificates/reject-certificate.js` |
| **Description** | Reject a certificate application |
| **Discord permissions** | `BanMembers` |
| **Role access** | admin (+ in-command `ADMIN_ROLE_ID` check) |

### `/send-cert-msg`

| | |
|---|---|
| **File** | `commands/certificates/send-cert-msg.js` |
| **Description** | Send the certificate application panel |
| **Discord permissions** | `ManageGuild` |
| **Role access** | admin |

### `/submit-cert-details`

| | |
|---|---|
| **File** | `commands/certificates/submit-cert-details.js` |
| **Description** | Submit certificate delivery details |
| **Discord permissions** | `BanMembers` |
| **Role access** | admin (+ in-command `ADMIN_ROLE_ID` check) |

---

## Confessions

### `/confess`

| | |
|---|---|
| **File** | `commands/confessions/confess.js` |
| **Description** | Submit an anonymous confession |
| **Discord permissions** | None |
| **Role access** | Public |
| **Dependencies** | `Confession` model, `MOD_ACTION_CHANNEL`, `systems/confessions.js` |

---

## Fun

### `/ping`

| | |
|---|---|
| **File** | `commands/fun/ping.js` |
| **Description** | Replies with Pong! |
| **Discord permissions** | None |
| **Role access** | Public |

---

## Helper

### `/helper`

| | |
|---|---|
| **File** | `commands/helper/helper.js` |
| **Description** | Request help from the assigned subject helper |
| **Discord permissions** | None |
| **Role access** | Public |
| **Dependencies** | `HelperRole` model (channel → role mapping) |

---

## Moderation

### `/add-role`

| | |
|---|---|
| **File** | `commands/moderation/add-role.js` |
| **Description** | Add a role to a user |
| **Discord permissions** | `ChangeNickname` |
| **Role access** | admin, dcHead, generalStaff |
| **Hierarchy check** | Yes (user + role) |

### `/announce`

| | |
|---|---|
| **File** | `commands/moderation/announce.js` |
| **Description** | Send a professional announcement embed to any channel |
| **Discord permissions** | `SendMessages` |
| **Role access** | admin, generalStaff |

### `/audit`

| | |
|---|---|
| **File** | `commands/moderation/audit.js` |
| **Description** | View server-wide moderation audit logs (paginated) |
| **Discord permissions** | `SendMessages` |
| **Role access** | admin, generalStaff |

### `/ban`

| | |
|---|---|
| **File** | `commands/moderation/ban.js` |
| **Description** | Ban a user from the server |
| **Discord permissions** | `BanMembers` |
| **Role access** | admin, dcHead, srMods, jrMods |
| **Hierarchy check** | Yes |

### `/ban-appeal-approved`

| | |
|---|---|
| **File** | `commands/moderation/banAppealApproved.js` |
| **Description** | Approve ban appeal, notify, and unban |
| **Discord permissions** | `BanMembers` |
| **Role access** | admin, dcHead |

### `/ban-appeal-rejected`

| | |
|---|---|
| **File** | `commands/moderation/banAppealRejected.js` |
| **Description** | Reject a user's ban appeal and notify them |
| **Discord permissions** | `BanMembers` |
| **Role access** | admin, dcHead |

### `/clear-warnings`

| | |
|---|---|
| **File** | `commands/moderation/clearwarns.js` |
| **Description** | Clear all warnings for a user |
| **Discord permissions** | None |
| **Role access** | admin, dcHead |
| **Hierarchy check** | Yes |

### `/delete-warning`

| | |
|---|---|
| **File** | `commands/moderation/delwarn.js` |
| **Description** | Delete a specific warning by action ID |
| **Discord permissions** | None |
| **Role access** | admin, dcHead, srMods |

### `/get-notes`

| | |
|---|---|
| **File** | `commands/moderation/get-notes.js` |
| **Description** | View staff notes for a user |
| **Discord permissions** | None |
| **Role access** | admin, dcHead, srMods, jrMods, trialMods |

### `/kick`

| | |
|---|---|
| **File** | `commands/moderation/kick.js` |
| **Description** | Kick a member from the server |
| **Discord permissions** | None |
| **Role access** | admin, dcHead |
| **Hierarchy check** | Yes |

### `/lock`

| | |
|---|---|
| **File** | `commands/moderation/lock.js` |
| **Description** | Lock a channel to prevent members from sending messages |
| **Discord permissions** | `BanMembers` |
| **Role access** | admin, dcHead, srMods, jrMods |

### `/lock-status`

| | |
|---|---|
| **File** | `commands/moderation/lock-status.js` |
| **Description** | Check locked channels |
| **Discord permissions** | `ManageChannels` |
| **Role access** | admin, dcHead, srMods, jrMods |

### `/moderation-logs`

| | |
|---|---|
| **File** | `commands/moderation/modlogs.js` |
| **Description** | View moderation logs for a user |
| **Discord permissions** | `ManageMessages` |
| **Role access** | admin, dcHead, srMods, jrMods, trialMods, ialAgent |

### `/moderator-logs`

| | |
|---|---|
| **File** | `commands/moderation/moderatorlogs.js` |
| **Description** | View all moderation actions by a moderator |
| **Discord permissions** | None |
| **Role access** | admin, dcHead, srMods, ialAgent |

### `/my-warnings`

| | |
|---|---|
| **File** | `commands/moderation/my-warnings.js` |
| **Description** | View your active warnings |
| **Discord permissions** | None |
| **Role access** | Public |

### `/note`

| | |
|---|---|
| **File** | `commands/moderation/note.js` |
| **Description** | Add a staff note about a user |
| **Discord permissions** | None |
| **Role access** | admin, dcHead, srMods, jrMods, trialMods |

### `/pin`

| | |
|---|---|
| **File** | `commands/moderation/pin.js` |
| **Description** | Pin a message using its message ID |
| **Discord permissions** | `ManageMessages` |
| **Role access** | admin, dcHead, srMods |

### `/poll`

| | |
|---|---|
| **File** | `commands/moderation/poll.js` |
| **Description** | Create and manage server polls |
| **Discord permissions** | `ManageMessages` |
| **Role access** | admin, dcHead, generalStaff, srMods, jrMods, trialMods |
| **Dependencies** | `Poll`, `PollVote` models, `systems/polls.js` |

### `/purge`

| | |
|---|---|
| **File** | `commands/moderation/purge.js` |
| **Description** | Delete messages with advanced filters |
| **Discord permissions** | `ManageMessages` |
| **Role access** | admin, dcHead, srMods |
| **Hierarchy check** | Yes (target user) |

### `/qotd-status`

| | |
|---|---|
| **File** | `commands/moderation/qotd-status.js` |
| **Description** | Check QOTD rotation and scheduler status |
| **Discord permissions** | `ManageMessages` |
| **Role access** | admin, dcHead, srMods, jrMods |
| **Dependencies** | `utils/qotdHelpers.js` |

### `/say`

| | |
|---|---|
| **File** | `commands/moderation/say.js` |
| **Description** | Make the bot send a message as an announcement |
| **Discord permissions** | `SendMessages` |
| **Role access** | admin, dcHead, srMods, jrMods |

### `/setnickname`

| | |
|---|---|
| **File** | `commands/moderation/setnickname.js` |
| **Description** | Set or change a user's nickname |
| **Discord permissions** | `ManageNicknames` |
| **Role access** | **Bug:** config has `set-nickname`, not `setnickname` — effectively Public |
| **Hierarchy check** | Yes |

### `/slowmode`

| | |
|---|---|
| **File** | `commands/moderation/slowmode.js` |
| **Description** | Set slowmode in a channel |
| **Discord permissions** | None |
| **Role access** | admin, dcHead, srMods |

### `/softban`

| | |
|---|---|
| **File** | `commands/moderation/softban.js` |
| **Description** | Softban (ban + unban to purge messages) |
| **Discord permissions** | None |
| **Role access** | **Public** (not in permissions.config) |
| **Hierarchy check** | Yes |

### `/timeout`

| | |
|---|---|
| **File** | `commands/moderation/timeout.js` |
| **Description** | Timeout a user for a specific duration |
| **Discord permissions** | `ModerateMembers` |
| **Role access** | admin, dcHead, srMods, jrMods, trialMods |
| **Hierarchy check** | Yes |

### `/timeout-status`

| | |
|---|---|
| **File** | `commands/moderation/timeout-status.js` |
| **Description** | Show all currently timed-out users |
| **Discord permissions** | `ModerateMembers` |
| **Role access** | admin, dcHead, srMods |

### `/unban`

| | |
|---|---|
| **File** | `commands/moderation/unban.js` |
| **Description** | Unban a user by ID |
| **Discord permissions** | None |
| **Role access** | admin, dcHead |

### `/unlock`

| | |
|---|---|
| **File** | `commands/moderation/unlock.js` |
| **Description** | Unlock a channel so members can send messages again |
| **Discord permissions** | `BanMembers` |
| **Role access** | admin, dcHead, srMods, jrMods |

### `/unpin`

| | |
|---|---|
| **File** | `commands/moderation/unpin.js` |
| **Description** | Unpin a message by message ID |
| **Discord permissions** | `ManageMessages` |
| **Role access** | admin, dcHead, srMods |

### `/untimeout`

| | |
|---|---|
| **File** | `commands/moderation/untimeout.js` |
| **Description** | Remove timeout from a user |
| **Discord permissions** | `ModerateMembers` |
| **Role access** | admin, dcHead, srMods, trialMods, jrMods |
| **Hierarchy check** | Yes |

### `/warn`

| | |
|---|---|
| **File** | `commands/moderation/warn.js` |
| **Description** | Warn a user |
| **Discord permissions** | None |
| **Role access** | admin, dcHead, srMods, jrMods, trialMods |
| **Hierarchy check** | Yes |
| **Dependencies** | `Warning`, `ModLog` models, `utils/logModAction.js` |

### `/warnings`

| | |
|---|---|
| **File** | `commands/moderation/warnings.js` |
| **Description** | View all warnings of a user |
| **Discord permissions** | `ManageMessages` |
| **Role access** | admin, dcHead, srMods, jrMods, trialMods |

---

## Reputation

### `/add-rep`

| | |
|---|---|
| **File** | `commands/reputation/addrep.js` |
| **Description** | Add reputation to a user |
| **Discord permissions** | `ManageRoles` |
| **Role access** | hlpHead, admin |

### `/leaderboard`

| | |
|---|---|
| **File** | `commands/reputation/leaderboard.js` |
| **Description** | View the top reputation holders |
| **Discord permissions** | None |
| **Role access** | Public |

### `/list-rep-ban`

| | |
|---|---|
| **File** | `commands/reputation/listrepban.js` |
| **Description** | List users banned from receiving reputation |
| **Discord permissions** | `ManageGuild` |
| **Role access** | admin, dcHead, hlpHead, srHelper, jrMods |

### `/my-rank`

| | |
|---|---|
| **File** | `commands/reputation/myrank.js` |
| **Description** | Check your reputation rank and progress |
| **Discord permissions** | None |
| **Role access** | Public |

### `/my-reputation`

| | |
|---|---|
| **File** | `commands/reputation/myrep.js` |
| **Description** | Display your current reputation publicly |
| **Discord permissions** | None |
| **Role access** | Public |

### `/rep`

| | |
|---|---|
| **File** | `commands/reputation/rep.js` |
| **Description** | Check another user's reputation |
| **Discord permissions** | None |
| **Role access** | Public |

### `/rep-ban`

| | |
|---|---|
| **File** | `commands/reputation/repban.js` |
| **Description** | Prevent a user from receiving reputation |
| **Discord permissions** | `ManageRoles` |
| **Role access** | admin, dcHead, hlpHead, srMods |

### `/rep-unban`

| | |
|---|---|
| **File** | `commands/reputation/repunban.js` |
| **Description** | Allow a user to receive reputation again |
| **Discord permissions** | `ManageRoles` |
| **Role access** | admin, dcHead, hlpHead, srMods |

### `/set-rep`

| | |
|---|---|
| **File** | `commands/reputation/setrep.js` |
| **Description** | Set a user's reputation to a value |
| **Discord permissions** | `ManageRoles` |
| **Role access** | hlpHead, admin |

### `/sub-rep`

| | |
|---|---|
| **File** | `commands/reputation/subrep.js` |
| **Description** | Subtract reputation from a user |
| **Discord permissions** | `ManageRoles` |
| **Role access** | hlpHead, admin |

---

## Secondweb

### `/subreddit`

| | |
|---|---|
| **File** | `commands/secondweb/subred.js` |
| **Description** | Get the link to the r/Alevel subreddit |
| **Discord permissions** | None |
| **Role access** | Public |
| **Dependencies** | Links to `https://www.reddit.com/r/alevel/` |

---

## Sethelper

### `/sethelper`

| | |
|---|---|
| **File** | `commands/sethelper/sethelper.js` |
| **Description** | Assign a helper role to this channel |
| **Discord permissions** | `ManageChannels` |
| **Role access** | **Bug:** config has `set-helper`, not `sethelper` — effectively Public |
| **Dependencies** | `HelperRole` model |

---

## Sticky

### `/add-sticky`

| | |
|---|---|
| **File** | `commands/sticky/add-sticky.js` |
| **Description** | Add or replace a sticky message in a channel |
| **Discord permissions** | `ManageMessages` |
| **Role access** | admin, dcHead, srMods, jrMods |

### `/edit-sticky`

| | |
|---|---|
| **File** | `commands/sticky/edit-sticky.js` |
| **Description** | Edit the sticky message in a channel |
| **Discord permissions** | `ManageMessages` |
| **Role access** | admin, dcHead, srMods |

### `/remove-sticky`

| | |
|---|---|
| **File** | `commands/sticky/remove-sticky.js` |
| **Description** | Remove the sticky message from a channel |
| **Discord permissions** | `ManageMessages` |
| **Role access** | admin, dcHead, srMods |

### `/sticky-list`

| | |
|---|---|
| **File** | `commands/sticky/sticky-list.js` |
| **Description** | List all sticky messages in this server |
| **Discord permissions** | `ManageMessages` |
| **Role access** | admin, dcHead, srMods |

### `/sticky-log`

| | |
|---|---|
| **File** | `commands/sticky/sticky-log.js` |
| **Description** | View recent sticky moderation actions |
| **Discord permissions** | `ManageMessages` |
| **Role access** | admin, dcHead |

### `/sticky-resend`

| | |
|---|---|
| **File** | `commands/sticky/sticky-resend.js` |
| **Description** | Force resend the sticky message |
| **Discord permissions** | `ManageMessages` |
| **Role access** | admin, dcHead, srMods |

---

## Task

Task commands are channel-scoped — they only work in `GRAPHIC_CHANNEL`, `DEV_CHANNEL`, or `WRITER_CHANNEL`.

### `/add-task`

| | |
|---|---|
| **File** | `commands/task/addtask.js` |
| **Description** | Create a new task |
| **Discord permissions** | `PinMessages` |
| **Role access** | admin, gfxHead |

### `/claim`

| | |
|---|---|
| **File** | `commands/task/claim.js` |
| **Description** | Claim a task |
| **Discord permissions** | None |
| **Role access** | admin, gfxHead, designer, trialDesigner |

### `/edit-task`

| | |
|---|---|
| **File** | `commands/task/edit-task.js` |
| **Description** | Edit an existing task (mods only) |
| **Discord permissions** | `PinMessages` |
| **Role access** | admin, gfxHead |

### `/finished-tsk`

| | |
|---|---|
| **File** | `commands/task/finished-tsk.js` |
| **Description** | Mark your claimed task as finished |
| **Discord permissions** | None |
| **Role access** | admin, gfxHead, designer, trialDesigner |

### `/mark-tsk-done`

| | |
|---|---|
| **File** | `commands/task/mark-tsk-done.js` |
| **Description** | Mark task complete and select designer's work |
| **Discord permissions** | `PinMessages` |
| **Role access** | admin, gfxHead |

### `/my-progress`

| | |
|---|---|
| **File** | `commands/task/my-progress.js` |
| **Description** | View your task progress and certificate eligibility |
| **Discord permissions** | None |
| **Role access** | admin, gfxHead, designer, trialDesigner |

### `/mytasks`

| | |
|---|---|
| **File** | `commands/task/mytasks.js` |
| **Description** | View your claimed, finished, and unclaimed tasks |
| **Discord permissions** | None |
| **Role access** | admin, gfxHead, designer, trialDesigner |

### `/tasks`

| | |
|---|---|
| **File** | `commands/task/tasks.js` |
| **Description** | View available tasks or task details |
| **Discord permissions** | None |
| **Role access** | admin, gfxHead |

---

## Utility

### `/avatar`

| | |
|---|---|
| **File** | `commands/utility/avatar.js` |
| **Description** | Get the avatar URL of a user (or your own) |
| **Discord permissions** | None |
| **Role access** | Public |

---

## Web

### `/website`

| | |
|---|---|
| **File** | `commands/web/website.js` |
| **Description** | Get the link to the r/Alevel website |
| **Discord permissions** | None |
| **Role access** | Public |
| **Dependencies** | Links to `https://ralevel.com/` |

---

## Related docs

- [Adding Commands](adding-commands.md) — how to create new commands
- [Systems](systems.md) — non-command interaction handlers (certificates, confessions, polls)
- [Environment Variables](environment-variables.md) — role and channel IDs
