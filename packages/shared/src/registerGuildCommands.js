const fs = require("node:fs");
const path = require("node:path");
const { REST, Routes } = require("discord.js");
const { DEFAULT_COMMAND_DISCORD_PERMISSIONS } = require("@ralevel/db");
const {
  permissionNameFromBitfield,
  applyDiscordPermissionOverride,
  normalizeOverrides,
} = require("./commandPermissions");
const {
  getEffectiveCommandName,
  applyCommandNameOverride,
  normalizeNameOverrides,
} = require("./commandDisplayNames");
const {
  applyMetadataOverride,
  normalizeMetadataOverrides,
} = require("./commandMetadataOverrides");

function resolveCommandsRoot(explicitRoot) {
  if (explicitRoot) return path.resolve(explicitRoot);

  const candidates = [
    path.resolve(process.cwd(), "apps/bot/commands"),
    path.resolve(process.cwd(), "../bot/commands"),
    path.resolve(__dirname, "../../../apps/bot/commands"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  throw new Error("Could not find bot commands directory");
}

function loadCommandModules(commandsRoot) {
  const root = resolveCommandsRoot(commandsRoot);
  const modules = [];

  const folders = fs
    .readdirSync(root)
    .filter((entry) => fs.statSync(path.join(root, entry)).isDirectory());

  for (const folder of folders) {
    const folderPath = path.join(root, folder);
    const files = fs
      .readdirSync(folderPath)
      .filter((file) => file.endsWith(".js"));

    for (const file of files) {
      const filePath = path.resolve(folderPath, file);
      // eslint-disable-next-line import/no-dynamic-require, global-require
      const command = require(filePath);
      if (!command?.data || !command?.execute) continue;
      modules.push({ folder, command });
    }
  }

  return modules;
}

function loadCommandPayloads(
  commandsRoot,
  permissionOverrides = {},
  nameOverrides = {},
  metadataOverrides = {},
) {
  const normalizedPermissionOverrides = normalizeOverrides(permissionOverrides);
  const normalizedNameOverrides = normalizeNameOverrides(nameOverrides);
  const normalizedMetadataOverrides = normalizeMetadataOverrides(metadataOverrides);
  const modules = loadCommandModules(commandsRoot);

  return modules
    .map(({ folder, command }) => {
      const payload = command.data.toJSON();
      const fileDefault = permissionNameFromBitfield(
        payload.default_member_permissions,
      );
      const overrideValue = Object.prototype.hasOwnProperty.call(
        normalizedPermissionOverrides,
        payload.name,
      )
        ? normalizedPermissionOverrides[payload.name]
        : undefined;

      const effectivePermission =
        overrideValue !== undefined ? overrideValue || null : fileDefault;

      const displayName = normalizedNameOverrides[payload.name];
      const effectiveName = getEffectiveCommandName(
        payload.name,
        normalizedNameOverrides,
      );

      let nextPayload = applyDiscordPermissionOverride(payload, overrideValue);
      nextPayload = applyCommandNameOverride(nextPayload, effectiveName);
      nextPayload = applyMetadataOverride(
        nextPayload,
        normalizedMetadataOverrides[payload.name],
      );

      return {
        category: folder,
        name: payload.name,
        displayName:
          displayName && displayName !== payload.name ? displayName : null,
        effectiveName,
        fileDefault,
        saved:
          overrideValue !== undefined ? overrideValue || null : undefined,
        effective: effectivePermission,
        payload: nextPayload,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function registerGuildCommands({
  token,
  clientId,
  guildId,
  commandsRoot,
  overrides = {},
  nameOverrides = {},
  metadataOverrides = {},
}) {
  if (!token) throw new Error("TOKEN is required to register guild commands");
  if (!clientId) {
    throw new Error("CLIENT_ID is required to register guild commands");
  }
  if (!guildId) {
    throw new Error("GUILD_ID is required to register guild commands");
  }

  const entries = loadCommandPayloads(
    commandsRoot,
    overrides,
    nameOverrides,
    metadataOverrides,
  );
  const body = entries.map((entry) => entry.payload);
  const rest = new REST().setToken(token);

  const data = await rest.put(
    Routes.applicationGuildCommands(clientId, guildId),
    { body },
  );

  return {
    commandCount: Array.isArray(data) ? data.length : body.length,
    commands: entries,
  };
}

module.exports = {
  DEFAULT_COMMAND_DISCORD_PERMISSIONS,
  resolveCommandsRoot,
  loadCommandPayloads,
  registerGuildCommands,
};
