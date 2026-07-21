/**
 * Process-wide GuildConfig cache. Loaded once at bot startup; restart to refresh.
 */

let guildConfig = null;

function setGuildConfig(config) {
  guildConfig = config;
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

function getChannelId(key, config = guildConfig) {
  if (!config?.channels) return "";
  return config.channels[key] || "";
}

function resolveRoleKeys(keys = [], config = guildConfig) {
  const map = getRoleMap(config);
  return keys.map((k) => map[k]).filter(Boolean);
}

/**
 * Allowed Discord role IDs for a slash command. Empty array / missing = public.
 */
function getCommandAllowedRoleIds(commandName, config = guildConfig) {
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
  return obj;
}

module.exports = {
  setGuildConfig,
  getGuildConfig,
  tryGetGuildConfig,
  getRoleMap,
  getRoleId,
  getChannelId,
  resolveRoleKeys,
  getCommandAllowedRoleIds,
  toPlainConfig,
};
