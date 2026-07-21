# Environment Variables

Every environment variable used by the r/alevel monorepo. Copy `.env.example` to `.env` at the **repo root** and fill in real values.

**Apps:**
- `apps/bot` loads root `.env` via `loadEnv.js`
- `apps/web` loads root `.env` via `next.config.ts` (`dotenv`); optional overrides in `apps/web/.env.local`
- Shared between bot and web: `MONGO_URI`, `GUILD_ID`
- Bot-only secrets: Discord `TOKEN`, `CLIENT_ID`, `REDIS_URL`
- **Guild settings** (channels, roles, command permissions, feature toggles, etc.) live in MongoDB `GuildConfig`, edited via the web dashboard. Env channel/role IDs are seed/fallback only.

**Security:** Never commit `.env` to git. It is excluded by `.gitignore` and `.dockerignore`. Rotate credentials if they are ever exposed. The dashboard has **no auth yet** — do not expose it publicly until Clerk is wired up.

---

## How configuration is loaded

- Bot: `require("./loadEnv")` in `apps/bot/index.js` and scripts (loads repo-root `.env`)
- On startup the bot loads `GuildConfig` for `GUILD_ID` (creates from env defaults if missing) via `utils/loadGuildConfig.js`
- Runtime permissions/channels/roles come from that in-memory config — **restart the bot** after dashboard settings changes
- Seed/overwrite manually: `pnpm --filter @ralevel/bot seed:guild-config` (add `--force` to overwrite)
- `@ralevel/shared` permissions remain a historical/default reference; live ACL is `GuildConfig.commandPermissions`
- `redis.js` throws immediately if `REDIS_URL` is missing (before the bot can start)
- `MONGO_URI` and `TOKEN` are not validated at startup — missing values fail at runtime

---

## Core variables

### `TOKEN`

|                |                                                        |
| -------------- | ------------------------------------------------------ |
| **Purpose**    | Discord bot token for gateway login and REST API calls |
| **Example**    | `MTIzNDU2Nzg5MyZ1234567890`                            |
| **Required**   | Yes                                                    |
| **If missing** | `client.login()` fails; bot never connects             |

Used in: `index.js`, `scripts/deploy-commands.js`, `scripts/migrateWarnings.js`

---

### `MONGO_URI`

|                |                                                                                        |
| -------------- | -------------------------------------------------------------------------------------- |
| **Purpose**    | MongoDB connection string for all persistent data                                      |
| **Example**    | `mongodb+srv://user:pass@cluster.mongodb.net/r_alevel_bot?retryWrites=true&w=majority` |
| **Required**   | Yes                                                                                    |
| **If missing** | Mongoose connection fails; all DB operations error                                     |

Used in: `database.js`, verification scripts, migration scripts

---

### `REDIS_URL`

|                       |                                                                |
| --------------------- | -------------------------------------------------------------- |
| **Purpose**           | Redis connection for daily message counters and finalize locks |
| **Example (local)**   | `redis://127.0.0.1:6379`                                       |
| **Example (Coolify)** | `redis://redis:6379` (internal service URL)                    |
| **Required**          | Yes                                                            |
| **If missing**        | Process throws `REDIS_URL is required` on import of `redis.js` |

Used in: `redis.js` → `messageTracker`, `dailyFinalize`, `dailyFinalizeSystem`

---

### `GUILD_ID`

|                |                                                     |
| -------------- | --------------------------------------------------- |
| **Purpose**    | Target Discord server ID                            |
| **Example**    | `1114437735692902481`                               |
| **Required**   | Yes (for finalize, deploy, flush scripts)           |
| **If missing** | Daily finalize skips or errors; deploy script fails |

Used in: `scripts/deploy-commands.js`, `systems/dailyFinalizeSystem.js`, `utils/dailyFinalize.js`, `utils/flushRedisToMongo.js`

---

### `CLIENT_ID`

|                |                                                       |
| -------------- | ----------------------------------------------------- |
| **Purpose**    | Discord application ID for slash command registration |
| **Example**    | `1127197280651464714`                                 |
| **Required**   | Deploy-only (not needed for `node index.js`)          |
| **If missing** | `scripts/deploy-commands.js` fails                    |

---

## Channel variables

| Variable                   | Purpose                                           | Required        | If missing                          |
| -------------------------- | ------------------------------------------------- | --------------- | ----------------------------------- |
| `APPLICATION_CHANNEL`      | Certificate application panel channel             | For certs       | Certificate apply flow breaks       |
| `REVIEW_CHANNEL`           | Staff review channel for certificate applications | For certs       | Review messages not posted          |
| `CERT_UPDATES_CHANNEL`     | Public certificate status updates                 | For certs       | Status updates not posted           |
| `GRAPHIC_CHANNEL`          | GFX team task channel                             | For tasks       | Task commands fail in wrong channel |
| `DEV_CHANNEL`              | Dev team task channel                             | For tasks       | Same                                |
| `WRITER_CHANNEL`           | Writer team task channel                          | For tasks       | Same                                |
| `WELCOME_CHANNEL`          | New member welcome embeds                         | For welcome     | Welcome system silently fails       |
| `MOD_ACTION_CHANNEL`       | Mod notifications for confessions                 | For confessions | Confession mod alerts not sent      |
| `VENT_CHANNEL`             | Public confession posting channel                 | For confessions | Approved confessions not posted     |
| `MOD_LOG_CHANNEL_ID`       | Moderation action embeds                          | For mod logs    | Mod actions not logged to channel   |
| `LEVELUP_CHANNEL_ID`       | XP rank-up announcements                          | For XP ranks    | Level-up messages not sent          |
| `QOTD_REMINDER_CHANNEL_ID` | QOTD daily reminder channel                       | Optional        | QOTD scheduler logs warning, skips  |

---

## Staff and permission roles

These map to role groups in `permissions.config.js`. If a role ID is missing/undefined, users with that role cannot pass permission checks for affected commands.

| Variable                                | Role group                   | Used for                                          |
| --------------------------------------- | ---------------------------- | ------------------------------------------------- |
| `ADMIN_ROLE_ID`                         | `admin`                      | Broad admin access, certificate approval          |
| `GFX_HEAD_ROLE_ID`                      | `gfxHead`                    | Task management                                   |
| `DC_HEAD_ROLE_ID`                       | `dcHead`                     | Discord/community head commands                   |
| `RDT_HEAD_ROLE_ID`                      | `rdtHead`                    | Reddit head (defined, rarely used in command map) |
| `HLP_HEAD_ROLE_ID`                      | `hlpHead`                    | Helper head, rep management                       |
| `COMM_HEAD_ROLE_ID`                     | `commHead`                   | Communications head (defined, rarely used)        |
| `GENERAL_STAFF_ROLE_ID`                 | `generalStaff`               | Announce, audit, add/remove role                  |
| `SR_MOD_ROLE_ID`                        | `srMods`                     | Senior mod commands                               |
| `JR_MOD_ROLE_ID`                        | `jrMods`                     | Junior mod commands                               |
| `TRIAL_MOD_ROLE_ID`                     | `trialMods`                  | Trial mod commands                                |
| `REDDIT_MOD_ROLE_ID`                    | `redditMods`                 | Reddit mod (defined, rarely used)                 |
| `SR_HELPER_ROLE_ID`                     | `srHelper`                   | Senior helper, cert eligibility                   |
| `JR_HELPER_ROLE_ID`                     | `jrHelper`                   | Junior helper (defined, rarely used)              |
| `LEAD_DESIGNER_ROLE_ID`                 | `leadDesigner`               | Lead designer (defined, rarely used)              |
| `DESIGNER_ROLE_ID`                      | `designer`                   | Task claim/finish                                 |
| `TRIAL_DESIGNER_ROLE_ID`                | `trialDesigner`              | Trial designer task access                        |
| `RESOURCE_CONTRIBUTOR_ROLE_ID`          | `resourceContributor`        | Optional cert reward role                         |
| `ENGAGEMENT_COORDINATOR_ROLE_ID`        | `EngagementCoordinator`      | Engagement roles                                  |
| `ENGAGEMENT_SPECIALIST_ROLE_ID`         | `EngagementSpecialist`       | Engagement roles                                  |
| `ENGAGEMENT_TRIAL_ROLE_ID`              | `EngagementTrial`            | Engagement trial (see naming note below)          |
| `IAL_AGENT_ROLE_ID`                     | `ialAgent`                   | Internal affairs agent                            |
| `INTERNAL_AFFAIR_AND_LOGISTICS_ROLE_ID` | `internalAffairAndLogistics` | IAL role                                          |
| `WRITER_ROLE_ID`                        | `writer`                     | Writer role                                       |
| `BOOSTER_ROLE_ID`                       | `booster`                    | 2× message XP in Redis tracker                    |

**Required for correct permissions:** All of the above that appear in `permissions.config.js` command mappings.

---

## Reputation tier roles

| Variable                | Tier threshold   | Read by                                           |
| ----------------------- | ---------------- | ------------------------------------------------- |
| `GIGACHAD_ROLE_ID`      | 1000+ rep        | `systems/reputation.js`, `utils/assignRepRole.js` |
| `EXPERT_ROLE_ID`        | 500+ rep         | Same                                              |
| `ADVANCED_ROLE_ID`      | 100+ rep         | Same                                              |
| `INTERMEDIATE_ROLE_ID`  | 50+ rep          | Same                                              |
| `ROLE_BEGINNER_ROLE_ID` | 10+ rep          | `systems/reputation.js`, `utils/assignRepRole.js` |
| `BEGINNER_ROLE_ID`      | Permissions only | `permissions.config.js`                           |

**Naming mismatch:** Reputation auto-assignment reads `ROLE_BEGINNER_ROLE_ID`. If your `.env` only sets `BEGINNER_ROLE_ID`, the Beginner rep tier role will not be assigned automatically. Set both to the same role ID.

---

## Optional variables

### `DISABLED_CHANNELS`

|                |                                                    |
| -------------- | -------------------------------------------------- |
| **Purpose**    | Channel IDs where automatic reputation is disabled |
| **Example**    | `["1129785430326394892","1446768750509686925"]`    |
| **Required**   | No                                                 |
| **If missing** | Reputation runs in all channels                    |

Uses substring matching: `process.env.DISABLED_CHANNELS.includes(channelId)`. A JSON-like string works because the channel ID appears as a substring.

Used in: `systems/messageRouter.js`

---

### `DISABLED_CATEGORIES`

|                |                                                     |
| -------------- | --------------------------------------------------- |
| **Purpose**    | Category IDs where automatic reputation is disabled |
| **Example**    | `["1330029371934773268"]`                           |
| **Required**   | No                                                  |
| **If missing** | Reputation runs in all categories                   |

Used in: `systems/messageRouter.js`

---

### `STAFF_CHANNEL_IDS`

|                |                                                                    |
| -------------- | ------------------------------------------------------------------ |
| **Purpose**    | Comma-separated staff channel IDs where automatic reputation is disabled |
| **Example**    | `1446768750509686925,1484060981658390579,1450047433433415733`      |
| **Required**   | No                                                                 |
| **If missing** | Reputation is not skipped based on staff channels                  |

Uses the same substring matching as `DISABLED_CHANNELS`. All thank-word triggers (`thanks`, `thnx`, `tnx`, `ty`, etc.) are blocked; manual admin rep commands are unaffected.

Used in: `systems/messageRouter.js`

---

### `MOD_ROLES`

|                |                                                              |
| -------------- | ------------------------------------------------------------ |
| **Purpose**    | Comma-separated mod role IDs for certificate status commands |
| **Example**    | `1233291596695343134,1114451108811767928`                    |
| **Required**   | No                                                           |
| **If missing** | Certificate status mod checks only use `ADMIN_ROLE_ID`       |

Used in: `commands/certificates/certificate-status.js`, `certificate-status-mod.js`, `mark-cert-delivered.js`

---

### `NODE_ENV`

|                |                                          |
| -------------- | ---------------------------------------- |
| **Purpose**    | Set to `production` in Dockerfile        |
| **Required**   | No                                       |
| **If missing** | No effect — not read by application code |

---

## Known configuration bugs

Document these for maintainers. Fixing them requires code changes.

| Issue                    | Code expects               | Config may have                                 | Impact                                      |
| ------------------------ | -------------------------- | ----------------------------------------------- | ------------------------------------------- |
| Beginner rep role        | `ROLE_BEGINNER_ROLE_ID`    | `BEGINNER_ROLE_ID` only                         | Beginner tier role not auto-assigned        |
| Engagement trial         | `ENGAGEMENT_TRIAL_ROLE_ID` | `ENGAGEMENT_TRIALIST_ROLE_ID`                   | Role group is `undefined` in permissions    |
| Set nickname permissions | Slash name `setnickname`   | Config key `set-nickname`                       | Role gate bypassed — command appears public |
| Set helper permissions   | Slash name `sethelper`     | Config key `set-helper`                         | Role gate bypassed                          |
| Softban permissions      | —                          | Not in permissions.config                       | Only Discord permission bits apply          |
| Cert delivered channel   | `CERT_UPDATES_CHANNEL`     | `mark-cert-delivered.js` reads `REVIEW_CHANNEL` | Updates posted to wrong channel             |

---

## Environment by feature

Quick reference for which variables each feature needs:

| Feature                 | Required variables                                                                                    |
| ----------------------- | ----------------------------------------------------------------------------------------------------- |
| Bot startup             | `TOKEN`, `MONGO_URI`, `REDIS_URL`                                                                     |
| Slash command deploy    | `TOKEN`, `CLIENT_ID`, `GUILD_ID`                                                                      |
| Message tracking + XP   | `GUILD_ID`, `BOOSTER_ROLE_ID`, `LEVELUP_CHANNEL_ID`                                                   |
| Reputation              | Tier role IDs, optional `DISABLED_CHANNELS` / `DISABLED_CATEGORIES` / `STAFF_CHANNEL_IDS`              |
| Certificates            | `APPLICATION_CHANNEL`, `REVIEW_CHANNEL`, `CERT_UPDATES_CHANNEL`, `ADMIN_ROLE_ID`, `SR_HELPER_ROLE_ID` |
| Confessions             | `MOD_ACTION_CHANNEL`, `VENT_CHANNEL`                                                                  |
| Tasks                   | `GRAPHIC_CHANNEL`, `DEV_CHANNEL`, `WRITER_CHANNEL`, designer role IDs                                 |
| Welcome                 | `WELCOME_CHANNEL`                                                                                     |
| QOTD                    | `QOTD_REMINDER_CHANNEL_ID`                                                                            |
| Mod logging             | `MOD_LOG_CHANNEL_ID`                                                                                  |
| All restricted commands | All `*_ROLE_ID` variables in `permissions.config.js`                                                  |

See also: [Setup](setup.md) · [Deployment](deployment.md) · [Troubleshooting](troubleshooting.md)
