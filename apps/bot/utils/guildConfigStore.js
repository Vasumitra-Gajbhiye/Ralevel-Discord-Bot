/**
 * Process-wide GuildConfig cache.
 * Loaded at bot startup and refreshed by the GuildConfig watcher when Mongo updates.
 */

const { getBanAppealApproverRoleKeys } = require("./banAppeals");
const { getCommandCatalog } = require("@ralevel/shared/commandCatalog");
const {
  buildDeployedToCanonicalObject,
} = require("@ralevel/shared/commandDisplayNames");

let guildConfig = null;
let deployedToCanonical = {};

function rebuildDeployedToCanonicalMap(config = guildConfig) {
  const nameOverrides = config?.commandDisplayNames;
  const normalized =
    nameOverrides instanceof Map
      ? Object.fromEntries(nameOverrides)
      : { ...(nameOverrides || {}) };

  deployedToCanonical = buildDeployedToCanonicalObject(
    getCommandCatalog(),
    normalized,
  );
}

function setGuildConfig(config) {
  guildConfig = config;
  rebuildDeployedToCanonicalMap(config);
}

function getGuildConfig() {
  if (!guildConfig) {
    throw new Error(
      "GuildConfig not loaded yet. Ensure loadGuildConfig() ran on startup.",
    );
  }
  return guildConfig;
}

function tryGetGuildConfig() {
  return guildConfig;
}

/** roleKey -> roleId */
function getRoleMap(config = guildConfig) {
  const map = {};
  if (!config?.roles) return map;
  for (const r of config.roles) {
    if (r.key) map[r.key] = r.roleId || "";
  }
  return map;
}

function getRoleId(key, config = guildConfig) {
  return getRoleMap(config)[key] || "";
}

function getChannelMap(config = guildConfig) {
  const map = {};
  if (!config?.channels) return map;
  if (Array.isArray(config.channels)) {
    for (const c of config.channels) {
      if (c?.key) map[c.key] = c.channelId || "";
    }
    return map;
  }
  return config.channels;
}

function getChannelId(key, config = guildConfig) {
  return getChannelMap(config)[key] || "";
}

function resolveRoleKeys(keys = [], config = guildConfig) {
  const map = getRoleMap(config);
  return keys.map((k) => map[k]).filter(Boolean);
}

function resolveCanonicalCommandName(deployedName) {
  return deployedToCanonical[deployedName] || deployedName;
}

/**
 * Allowed Discord role IDs for a slash command. Empty array / missing = public.
 */
function getCommandAllowedRoleIds(commandName, config = guildConfig) {
  if (
    commandName === "ban-appeal-approved" ||
    commandName === "ban-appeal-rejected"
  ) {
    const keys = getBanAppealApproverRoleKeys(config);
    if (!keys || keys.length === 0) return null;
    return resolveRoleKeys(keys, config);
  }

  if (!config?.commandPermissions) return null;
  const perms = config.commandPermissions;
  const keys = perms instanceof Map ? perms.get(commandName) : perms[commandName];
  if (!keys || !Array.isArray(keys) || keys.length === 0) return null;
  return resolveRoleKeys(keys, config);
}

function toPlainConfig(doc) {
  const obj = typeof doc.toObject === "function" ? doc.toObject() : { ...doc };
  // Normalize Map -> plain object for commandPermissions
  if (obj.commandPermissions instanceof Map) {
    obj.commandPermissions = Object.fromEntries(obj.commandPermissions);
  }
  if (obj.commandDiscordPermissions instanceof Map) {
    obj.commandDiscordPermissions = Object.fromEntries(
      obj.commandDiscordPermissions,
    );
  }
  if (obj.commandDisplayNames instanceof Map) {
    obj.commandDisplayNames = Object.fromEntries(obj.commandDisplayNames);
  }
  if (obj.commandMetadataOverrides instanceof Map) {
    obj.commandMetadataOverrides = Object.fromEntries(obj.commandMetadataOverrides);
  }
  return obj;
}

module.exports = {
  setGuildConfig,
  getGuildConfig,
  tryGetGuildConfig,
  getRoleMap,
  getRoleId,
  getChannelMap,
  getChannelId,
  resolveRoleKeys,
  resolveCanonicalCommandName,
  getCommandAllowedRoleIds,
  toPlainConfig,
};
