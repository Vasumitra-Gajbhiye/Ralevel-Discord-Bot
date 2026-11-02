const path = require("path");

// Command modules pull in the Redis client; stub it so this runs offline.
const redisPath = require.resolve("../redis");
require.cache[redisPath] = {
  id: redisPath,
  filename: redisPath,
  loaded: true,
  exports: {},
};

const { ApplicationCommandType, SlashCommandBuilder } = require("discord.js");
const realDb = require("@ralevel/db");
const {
  COMMAND_LIMITS,
  assertCommandLimits,
} = require("@ralevel/shared/commandLimits");
const { loadCommandPayloads } = require("@ralevel/shared/registerGuildCommands");
const {
  registerGuildCommandsFromCatalog,
} = require("@ralevel/shared/commandPermissions");
const { getCommandCatalog } = require("@ralevel/shared/commandCatalog");
const { setGuildConfig } = require("../utils/guildConfigStore");
const { buildSubcommandCommand } = require("../utils/subcommandCommand");
const { planMergedCommandMigration } = require("./migrate-merged-command-settings");

const commandsRoot = path.join(__dirname, "..", "commands");

const MERGED = {
  sticky: {
    permission: "ManageMessages",
    subcommands: ["add", "edit", "remove", "list", "log", "resend"],
  },
  "xp-admin": {
    permission: "Administrator",
    subcommands: ["add", "set", "subtract", "set-msg-count"],
  },
  "rep-admin": {
    permission: "ManageRoles",
    subcommands: ["add", "set", "subtract"],
  },
  definition: {
    permission: null,
    subcommands: ["add", "edit", "delete"],
  },
};

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function fakePayloads(count, type) {
  return Array.from({ length: count }, (_, i) => ({ name: `cmd-${i}`, type }));
}

function expectLimitError(payloads, text) {
  try {
    assertCommandLimits(payloads);
  } catch (err) {
    assert(err.message.includes(text), `unexpected limit error: ${err.message}`);
    return;
  }
  throw new Error(`expected a limit error containing "${text}"`);
}

function testLimitGuard() {
  assertCommandLimits(fakePayloads(COMMAND_LIMITS.chatInput, ApplicationCommandType.ChatInput));
  assertCommandLimits(fakePayloads(100, undefined));
  assertCommandLimits([
    ...fakePayloads(5, ApplicationCommandType.User),
    ...fakePayloads(5, ApplicationCommandType.Message),
  ]);

  expectLimitError(fakePayloads(101, ApplicationCommandType.ChatInput), "101 slash commands (limit 100)");
  expectLimitError(fakePayloads(6, ApplicationCommandType.Message), "6 message context menus (limit 5)");
  expectLimitError(fakePayloads(6, ApplicationCommandType.User), "6 user context menus (limit 5)");
}

async function testDashboardSyncChecksBeforeDiscord() {
  const originalFetch = global.fetch;
  let called = false;
  global.fetch = async () => {
    called = true;
    throw new Error("should not reach Discord");
  };

  try {
    const catalogCommands = fakePayloads(101, ApplicationCommandType.ChatInput).map((payload) => ({
      category: "test",
      name: payload.name,
      fileDefault: null,
      payload: { ...payload, description: "x" },
    }));
    let error;
    await registerGuildCommandsFromCatalog({
      token: "t",
      clientId: "c",
      guildId: "g",
      catalogCommands,
    }).catch((err) => {
      error = err;
    });
    assert(error?.message.includes("101 slash commands"), "dashboard sync should fail on the limit");
    assert(!called, "dashboard sync must not call Discord when over the limit");
  } finally {
    global.fetch = originalFetch;
  }
}

function testDeployedCommands() {
  const entries = loadCommandPayloads(commandsRoot);
  const counts = assertCommandLimits(entries.map((entry) => entry.payload));
  const names = new Set(entries.map((entry) => entry.name));

  for (const oldName of Object.keys(realDb.MERGED_SUBCOMMAND_KEYS)) {
    assert(!names.has(oldName), `/${oldName} should be a subcommand now`);
  }

  for (const [name, expected] of Object.entries(MERGED)) {
    const entry = entries.find((e) => e.name === name);
    assert(entry, `/${name} should be registered`);
    assert(entry.fileDefault === expected.permission, `/${name} permission should be ${expected.permission}`);
    const subs = entry.payload.options.map((option) => option.name);
    assert(
      JSON.stringify(subs) === JSON.stringify(expected.subcommands),
      `/${name} subcommands: ${subs.join(", ")}`,
    );
  }

  const catalog = getCommandCatalog();
  for (const [name, expected] of Object.entries(MERGED)) {
    const keys = catalog.find((c) => c.name === name)?.subcommandSettings;
    assert(
      JSON.stringify(keys) === JSON.stringify(expected.subcommands.map((sub) => `${name} ${sub}`)),
      `catalog should list per-subcommand settings for /${name} (run export-command-catalog)`,
    );
  }

  return counts;
}

function testDefaultsUseSubcommandKeys() {
  for (const [oldName, newKey] of Object.entries(realDb.MERGED_SUBCOMMAND_KEYS)) {
    for (const map of ["DEFAULT_COMMAND_PERMISSIONS", "DEFAULT_COMMAND_DISCORD_PERMISSIONS", "DEFAULT_COMMAND_EPHEMERAL"]) {
      assert(!(oldName in realDb[map]), `${map} still has ${oldName}`);
    }
    assert(typeof realDb.DEFAULT_COMMAND_EPHEMERAL[newKey] === "boolean", `ephemeral default missing for "${newKey}"`);
  }

  const perms = realDb.DEFAULT_COMMAND_PERMISSIONS;
  assert(perms["sticky add"].includes("jrMods"), "jrMods should keep /sticky add");
  assert(!perms["sticky edit"].includes("jrMods"), "jrMods should not get /sticky edit");
  assert(!perms["sticky log"].includes("srMods"), "srMods should not get /sticky log");
  assert(realDb.DEFAULT_COMMAND_DISCORD_PERMISSIONS.sticky === "ManageMessages", "/sticky should need Manage Messages");
}

function testStartupMigrationKeepsLegacyKeys() {
  const doc = realDb.buildDefaultGuildConfig("guild1");
  doc.markModified = () => {};
  doc.commandPermissions = { ...doc.commandPermissions, "sticky-log": ["admin"] };
  delete doc.commandPermissions["sticky log"];

  realDb.migrateGuildConfigInPlace(doc);

  assert(
    JSON.stringify(doc.commandPermissions["sticky-log"]) === JSON.stringify(["admin"]),
    "startup migration must keep old-name settings until the one-off script moves them",
  );
  assert(Array.isArray(doc.commandPermissions["sticky log"]), "startup migration should add \"sticky log\"");
  assert(!("sticky" in doc.commandPermissions), "role gates for /sticky live on its subcommands");
  assert(doc.commandDiscordPermissions.sticky === "ManageMessages", "/sticky visibility should be added");
  assert(!("sticky add" in doc.commandDiscordPermissions), "visibility is per top-level command only");
}

function testOneOffMigrationPlan() {
  const raw = {
    commandPermissions: { "add-sticky": ["admin"], "sticky-log": [], ban: ["admin"] },
    commandEphemeral: { "add-xp": true },
    commandDiscordPermissions: {
      "add-rep": "ManageGuild",
      "set-rep": "ManageGuild",
      "sub-rep": "ManageGuild",
      "add-xp": "Administrator",
      "set-xp": "",
    },
    commandDisplayNames: { "add-sticky": "pin-msg" },
    commandMetadataOverrides: {
      "remove-sticky": { description: "Remove it", options: [{ name: "channel", description: "Where" }] },
    },
  };

  const { $set, $unset, notes } = planMergedCommandMigration(raw);

  assert(JSON.stringify($set["commandPermissions.sticky add"]) === '["admin"]', "role gate should move to \"sticky add\"");
  assert(JSON.stringify($set["commandPermissions.sticky log"]) === "[]", "an empty gate should still move");
  assert(!("commandPermissions.ban" in $set), "other commands are untouched");
  assert($set["commandEphemeral.xp-admin add"] === true, "ephemeral should move to \"xp-admin add\"");
  assert($set["commandDiscordPermissions.rep-admin"] === "ManageGuild", "agreeing visibility should move to /rep-admin");
  assert(!("commandDiscordPermissions.xp-admin" in $set), "conflicting visibility must not be guessed");
  assert(!("commandDiscordPermissions.add-xp" in $unset), "conflicting visibility keys are kept");
  assert(notes.some((note) => note.startsWith("CONFLICT") && note.includes("/xp-admin")), "conflict should be reported");
  assert("commandDisplayNames.add-sticky" in $unset, "old display names are dropped");

  const sticky = $set["commandMetadataOverrides.sticky"];
  const remove = sticky?.options?.find((option) => option.name === "remove");
  assert(remove?.description === "Remove it", "description override should move to the subcommand");
  assert(remove.options?.[0]?.description === "Where", "option text overrides should move too");
  assert("commandMetadataOverrides.remove-sticky" in $unset, "old metadata key should be removed");
}

async function testDispatcherUsesSubcommandSettings() {
  const config = realDb.buildDefaultGuildConfig("guild1");
  for (const role of config.roles) {
    if (role.key === "srMods") role.roleId = "role-sr";
    if (role.key === "jrMods") role.roleId = "role-jr";
  }
  config.commandEphemeral = { ...config.commandEphemeral, "sticky list": false };
  setGuildConfig(config);

  const listeners = [];
  const client = {
    on: (event, handler) => {
      if (event === "interactionCreate") listeners.push(handler);
    },
  };
  require("../systems/commands.js")(client);
  for (const name of Object.keys(MERGED)) {
    assert(client.commands.has(name), `loader should register /${name}`);
  }

  const executed = [];
  const handler = (name) => ({
    subcommand: (sub) => sub.setName(name).setDescription(name),
    execute: async (interaction) => {
      executed.push(name);
      await interaction.reply({ content: "ok" });
    },
  });
  client.commands.set(
    "sticky",
    buildSubcommandCommand(
      new SlashCommandBuilder().setName("sticky").setDescription("x"),
      ["add", "edit", "list", "log"].map(handler),
    ),
  );

  const run = async (subcommand, roleId) => {
    const sent = [];
    const interaction = {
      commandName: "sticky",
      member: { roles: { cache: { some: (fn) => fn({ id: roleId }) } } },
      guild: null,
      options: { getSubcommand: () => subcommand },
      isAutocomplete: () => false,
      isChatInputCommand: () => true,
      isContextMenuCommand: () => false,
      deferReply: async () => {},
      reply: async (options) => {
        sent.push(options);
      },
    };
    for (const listener of listeners) await listener(interaction);
    return sent[0];
  };

  const jrAdd = await run("add", "role-jr");
  assert(executed.includes("add") && jrAdd.ephemeral === true, "jrMods can run /sticky add, ephemeral by default");

  const jrEdit = await run("edit", "role-jr");
  assert(!executed.includes("edit") && jrEdit.content.includes("permission"), "jrMods must not run /sticky edit");

  const srLog = await run("log", "role-sr");
  assert(!executed.includes("log") && srLog.content.includes("permission"), "srMods must not run /sticky log");

  const srList = await run("list", "role-sr");
  assert(executed.includes("list") && srList.ephemeral === false, "per-subcommand ephemeral setting should apply");
}

async function main() {
  testLimitGuard();
  await testDashboardSyncChecksBeforeDiscord();
  const counts = testDeployedCommands();
  testDefaultsUseSubcommandKeys();
  testStartupMigrationKeepsLegacyKeys();
  testOneOffMigrationPlan();
  await testDispatcherUsesSubcommandSettings();

  console.log(
    `verify-command-limits: all checks passed (${counts.chatInput} slash, ${counts.user} user, ${counts.message} message commands)`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("verify-command-limits failed:", err.message);
  process.exit(1);
});
