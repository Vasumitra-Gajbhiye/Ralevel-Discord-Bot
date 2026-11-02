/**
 * One-off: move dashboard settings saved under the old sticky / XP / rep /
 * definition command names onto the merged subcommand commands.
 *
 *   commandPermissions, commandEphemeral  "add-sticky" -> "sticky add" (unless
 *                                         "sticky add" was already changed)
 *   commandDiscordPermissions             "add-sticky" -> "sticky" (only if
 *                                         every old command in the group has
 *                                         the same value)
 *   commandMetadataOverrides              "add-sticky" -> "sticky" option "add"
 *   commandDisplayNames                   dropped (subcommands can't be renamed)
 *
 * Run after deploying the merged commands. Dry run by default:
 *   node apps/bot/scripts/migrate-merged-command-settings.js
 *   node apps/bot/scripts/migrate-merged-command-settings.js --apply
 */
require("../loadEnv");

const mongoose = require("mongoose");
const {
  connectDB,
  GuildConfig,
  MERGED_SUBCOMMAND_KEYS,
  DEFAULT_COMMAND_PERMISSIONS,
  DEFAULT_COMMAND_DISCORD_PERMISSIONS,
  DEFAULT_COMMAND_EPHEMERAL,
} = require("@ralevel/db");
const { getCommandCatalog } = require("@ralevel/shared/commandCatalog");
const {
  validateCommandMetadataOverrides,
} = require("@ralevel/shared/commandMetadataOverrides");

function toPlain(map) {
  if (!map) return {};
  return map instanceof Map ? Object.fromEntries(map) : { ...map };
}

function sameValue(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function splitKey(settingKey) {
  const [parent, subcommand] = settingKey.split(" ");
  return { parent, subcommand };
}

/** Builds the $set / $unset for one raw GuildConfig document. */
function planMergedCommandMigration(raw, catalog = getCommandCatalog()) {
  const $set = {};
  const $unset = {};
  const notes = [];

  // Startup fills the new keys with defaults, so a destination that still
  // holds its default is safe to replace. Anything else was set by an admin
  // after the deploy and is kept.
  const settingDefaults = {
    commandPermissions: (key) => DEFAULT_COMMAND_PERMISSIONS[key] ?? [],
    commandEphemeral: (key) => DEFAULT_COMMAND_EPHEMERAL[key] ?? false,
  };
  for (const [field, getDefault] of Object.entries(settingDefaults)) {
    const map = toPlain(raw[field]);
    for (const [oldName, newKey] of Object.entries(MERGED_SUBCOMMAND_KEYS)) {
      if (!(oldName in map)) continue;
      const legacy = map[oldName];
      const current = map[newKey];
      if (
        newKey in map &&
        !sameValue(current, legacy) &&
        !sameValue(current, getDefault(newKey))
      ) {
        notes.push(
          `CONFLICT ${field}: "${newKey}" was changed to ${JSON.stringify(current)}, ` +
            `${oldName} has ${JSON.stringify(legacy)}. Kept "${newKey}"; check it on Settings -> Commands.`,
        );
        continue;
      }
      if (!sameValue(current, legacy)) {
        $set[`${field}.${newKey}`] = legacy;
      }
      $unset[`${field}.${oldName}`] = "";
      notes.push(`${field}: ${oldName} -> "${newKey}" = ${JSON.stringify(legacy)}`);
    }
  }

  const discordPerms = toPlain(raw.commandDiscordPermissions);
  const groups = {};
  for (const [oldName, newKey] of Object.entries(MERGED_SUBCOMMAND_KEYS)) {
    (groups[splitKey(newKey).parent] ??= []).push(oldName);
  }
  for (const [parent, oldNames] of Object.entries(groups)) {
    const saved = oldNames.filter((name) => name in discordPerms);
    if (!saved.length) continue;

    const describe = (name) => `${name}=${discordPerms[name] || "Everyone"}`;
    const missing = oldNames.filter((name) => !(name in discordPerms));
    const values = new Set(saved.map((name) => discordPerms[name]));
    const [value] = values;
    const current = discordPerms[parent];
    const parentDefault =
      DEFAULT_COMMAND_DISCORD_PERMISSIONS[parent] ??
      catalog.find((cmd) => cmd.name === parent)?.fileDefault ??
      "";

    let conflict = null;
    if (missing.length) {
      conflict = `no saved value for ${missing.join(", ")}`;
    } else if (values.size > 1) {
      conflict = saved.map(describe).join(", ");
    } else if (current !== undefined && current !== value && current !== parentDefault) {
      conflict = `/${parent} was changed to ${current || "Everyone"}, old commands have ${value || "Everyone"}`;
    }
    if (conflict) {
      notes.push(
        `CONFLICT commandDiscordPermissions for /${parent}: ${conflict}. ` +
          "Left unchanged; pick one on Settings -> Command visibility.",
      );
      continue;
    }

    $set[`commandDiscordPermissions.${parent}`] = value;
    for (const name of saved) {
      $unset[`commandDiscordPermissions.${name}`] = "";
    }
    notes.push(`commandDiscordPermissions: /${parent} = ${value || "Everyone"}`);
  }

  const displayNames = toPlain(raw.commandDisplayNames);
  for (const oldName of Object.keys(MERGED_SUBCOMMAND_KEYS)) {
    if (!(oldName in displayNames)) continue;
    $unset[`commandDisplayNames.${oldName}`] = "";
    notes.push(
      `commandDisplayNames: dropped ${oldName} -> "${displayNames[oldName]}" (subcommands can't be renamed)`,
    );
  }

  const metadata = toPlain(raw.commandMetadataOverrides);
  const nextParents = {};
  for (const [oldName, newKey] of Object.entries(MERGED_SUBCOMMAND_KEYS)) {
    const override = metadata[oldName];
    if (!override) continue;
    const { parent, subcommand } = splitKey(newKey);
    const parentOverride = (nextParents[parent] ??= {
      ...(metadata[parent] || {}),
      options: [...(metadata[parent]?.options || [])],
    });
    parentOverride.options = parentOverride.options.filter(
      (option) => option.name !== subcommand,
    );
    parentOverride.options.push({ ...override, name: subcommand });
    $unset[`commandMetadataOverrides.${oldName}`] = "";
    notes.push(`commandMetadataOverrides: ${oldName} -> /${parent} ${subcommand}`);
  }
  if (Object.keys(nextParents).length) {
    const validation = validateCommandMetadataOverrides(catalog, nextParents);
    if (!validation.ok) {
      throw new Error(
        `Migrated metadata overrides are invalid: ${validation.errors.join("; ")}`,
      );
    }
    for (const [parent, override] of Object.entries(validation.overrides)) {
      $set[`commandMetadataOverrides.${parent}`] = override;
    }
  }

  return { $set, $unset, notes };
}

async function main() {
  const guildId = process.env.GUILD_ID;
  if (!guildId) {
    throw new Error("GUILD_ID is required");
  }

  const apply = process.argv.includes("--apply");
  await connectDB();

  const raw = await GuildConfig.collection.findOne({ guildId });
  if (!raw) {
    throw new Error(`No GuildConfig for ${guildId}`);
  }

  const { $set, $unset, notes } = planMergedCommandMigration(raw);
  if (!notes.length) {
    console.log(`Nothing to migrate for ${guildId}.`);
    return;
  }

  console.log(`${apply ? "Applying" : "Dry run"} for ${guildId}:`);
  for (const note of notes) console.log(`  ${note}`);

  if (!apply) {
    console.log("No changes written. Re-run with --apply to write them.");
    return;
  }

  const update = {};
  if (Object.keys($set).length) update.$set = { ...$set, updatedAt: new Date() };
  if (Object.keys($unset).length) update.$unset = $unset;
  await GuildConfig.collection.updateOne({ guildId }, update);
  console.log("✅ Migrated. Click Sync to Discord on Settings -> Commands to apply metadata changes.");
}

module.exports = { planMergedCommandMigration };

if (require.main === module) {
  main()
    .catch((err) => {
      console.error("❌ Migration failed:", err.message || err);
      process.exitCode = 1;
    })
    .finally(() => mongoose.disconnect().catch(() => {}));
}
