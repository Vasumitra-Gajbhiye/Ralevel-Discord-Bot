require("../loadEnv");

const {
  getGuildConfig,
  resolveRoleKeys,
} = require("./guildConfigStore");

function canViewPollBreakdown(member) {
  if (!member) return false;
  const keys = getGuildConfig().polls?.breakdownRoleKeys || [];
  const ids = resolveRoleKeys(keys);
  return member.roles.cache.some((role) => ids.includes(role.id));
}

module.exports = canViewPollBreakdown;
