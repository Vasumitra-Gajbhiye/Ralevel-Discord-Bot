# Adding Commands

This guide teaches you how to create, register, and deploy a new slash command in the r/alevel bot.

---

## Overview

Every command is a JavaScript module in `commands/<category>/` that exports:

```javascript
module.exports = {
  data: new SlashCommandBuilder()...,
  async execute(interaction) { ... }
};
```

Commands are:

1. **Loaded at runtime** by `systems/commands.js` (scans `commands/` on startup)
2. **Registered with Discord** via `scripts/deploy-commands.js` (run manually after changes)

There are no prefix commands. All user commands are slash commands.

---

## Step-by-step

### 1. Choose a category folder

Place your command in the appropriate subfolder of `commands/`:

```
commands/
├── applications/
├── certificates/
├── confessions/
├── fun/           ← simple/test commands
├── helper/
├── moderation/
├── reputation/
├── secondweb/
├── sethelper/
├── sticky/
├── task/
├── utility/
└── web/
```

Create a new folder if none fits, but follow existing naming (lowercase, single word).

### 2. Create the command file

**Minimal example** (`commands/fun/ping.js`):

```javascript
const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Replies with Pong!'),
  async execute(interaction) {
    return interaction.reply('Pong!');
  },
};
```

**With options and ephemeral reply:**

```javascript
const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('hello')
    .setDescription('Say hello to someone')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('User to greet')
        .setRequired(true)
    ),
  async execute(interaction) {
    const user = interaction.options.getUser('user');
    return interaction.reply({
      content: `Hello, ${user}!`,
      ephemeral: true, // only visible to the command user
    });
  },
};
```

**With Discord permission bits** (hides from users without the permission):

```javascript
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('admin-only-cmd')
    .setDescription('Only visible to moderators')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  async execute(interaction) {
    await interaction.reply('You have permission!');
  },
};
```

**Advanced example** (moderation command with DB writes — based on `commands/moderation/warn.js`):

```javascript
const { SlashCommandBuilder } = require('discord.js');
const Warning = require('../../models/warning');
const logModAction = require('../../utils/logModAction');
const crypto = require('crypto');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Warn a user.')
    .addUserOption(opt =>
      opt.setName('user').setDescription('User to warn').setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('reason').setDescription('Reason for warning').setRequired(true)
    ),

  async execute(interaction) {
    const user = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason');
    const actionId = crypto.randomUUID();

    await Warning.create({
      userId: user.id,
      userTag: user.tag,
      moderatorId: interaction.user.id,
      moderatorTag: interaction.user.tag,
      reason,
      actionId,
    });

    await logModAction(interaction, {
      action: 'warn',
      targetUser: user,
      reason,
      actionId,
    });

    return interaction.reply({
      content: `⚠️ Warned **${user.tag}** — ${reason}`,
      ephemeral: true,
    });
  },
};
```

### 3. Add role restrictions (if needed)

Edit `permissions.config.js`. The key **must exactly match** `data.setName()`:

```javascript
// permissions.config.js
const commands = {
  // ...
  "hello": [admin, dcHead],  // user needs admin OR dcHead role
  warn: [admin, dcHead, srMods, jrMods, trialMods],
};
```

Commands **not listed** are accessible to all members (subject to Discord permission bits).

**Common mistake:** Using `"set-nickname"` when the slash name is `setnickname`. Always copy the exact name from `setName()`.

### 4. Add hierarchy checks (moderation commands only)

If your command targets a user and should respect role hierarchy, add it to `HIERARCHY_TARGET_OPTIONS` in `systems/commands.js`:

```javascript
const HIERARCHY_TARGET_OPTIONS = {
  warn: "user",
  kick: "user",
  // add your command:
  "my-mod-cmd": "target",  // must match the option name in SlashCommandBuilder
};
```

For role assignment commands, also add to `HIERARCHY_ROLE_OPTIONS`:

```javascript
const HIERARCHY_ROLE_OPTIONS = {
  "add-role": "role",
  "remove-role": "role",
};
```

### 5. Deploy to Discord

Restart the bot (or let nodemon restart), then register the command with Discord:

```bash
node scripts/deploy-commands.js
```

Requires `TOKEN`, `CLIENT_ID`, and `GUILD_ID` in `.env`.

Expected output:

```
Started refreshing 73 application (/) commands.
Successfully reloaded 73 application (/) commands.
```

Commands appear in Discord immediately (guild-scoped, not global).

### 6. Test

1. Run the bot: `npm run dev`
2. Type `/` in Discord — your command should appear
3. Test with a user who has and lacks the required roles
4. Test error cases (invalid input, missing permissions)

---

## Naming conventions

| Element | Convention | Example |
|---------|------------|---------|
| Category folder | lowercase, single word | `moderation`, `reputation` |
| Filename | kebab-case preferred | `add-sticky.js`, `delwarn.js` |
| Slash name (`setName`) | lowercase, kebab-case for multi-word | `add-sticky`, `delete-warning` |
| Filename vs slash name | Often differ | `delwarn.js` → `/delete-warning` |

Discord slash command names must be lowercase, 1–32 characters, `a-z`, `0-9`, `-`, `_`.

---

## Command module contract

| Export | Type | Required |
|--------|------|----------|
| `data` | `SlashCommandBuilder` | Yes |
| `execute` | `async (interaction) => void` | Yes |

Files missing either export are skipped with a warning during deploy.

---

## Useful patterns

### Defer for long operations

```javascript
async execute(interaction) {
  await interaction.deferReply({ ephemeral: true });
  // ... slow DB or API call ...
  await interaction.editReply('Done!');
}
```

### Subcommands

```javascript
data: new SlashCommandBuilder()
  .setName('task')
  .setDescription('Task management')
  .addSubcommand(sub =>
    sub.setName('list').setDescription('List all tasks')
  )
  .addSubcommand(sub =>
    sub.setName('create').setDescription('Create a task')
      .addStringOption(o => o.setName('title').setRequired(true))
  ),

async execute(interaction) {
  const sub = interaction.options.getSubcommand();
  if (sub === 'list') { /* ... */ }
  if (sub === 'create') { /* ... */ }
}
```

### Using models and utils

```javascript
const Poll = require('../../models/poll');
const generateId = require('../../utils/generateId');
const logModAction = require('../../utils/logModAction');
```

Place imports relative to the command file. Models live in `models/`, helpers in `utils/`.

---

## Checklist

Before opening a PR with a new command:

- [ ] File in correct `commands/<category>/` folder
- [ ] Exports `data` (SlashCommandBuilder) and `execute`
- [ ] Slash name is lowercase and matches permissions.config key exactly
- [ ] Role restrictions added to `permissions.config.js` (if restricted)
- [ ] Hierarchy mapping added to `systems/commands.js` (if moderation)
- [ ] Discord permission bits set (if should be hidden from non-mods)
- [ ] Ran `node scripts/deploy-commands.js`
- [ ] Tested in dev guild with allowed and denied roles
- [ ] Error handling for missing DB records, invalid input, etc.

---

## Related docs

- [Commands](commands.md) — full command reference
- [Architecture](architecture.md) — how commands are loaded and routed
- [Environment Variables](environment-variables.md) — role IDs for permissions
- [Setup](setup.md) — local development setup
