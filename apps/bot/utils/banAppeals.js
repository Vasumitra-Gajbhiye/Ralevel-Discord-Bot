const DEFAULT_BAN_APPEAL_APPROVER_ROLE_KEYS = ["admin", "dcHead"];

function getBanAppealApproverRoleKeys(cfg) {
  const keys = cfg?.moderation?.banAppealApproverRoleKeys;
  if (Array.isArray(keys) && keys.length > 0) return keys;

  const perms = cfg?.commandPermissions;
  const legacy =
    perms instanceof Map
      ? perms.get("ban-appeal-approved")
      : perms?.["ban-appeal-approved"];
  if (Array.isArray(legacy) && legacy.length > 0) return legacy;

  return [...DEFAULT_BAN_APPEAL_APPROVER_ROLE_KEYS];
}

function memberHasBanAppealApproverRole(member, config) {
  const { getGuildConfig, resolveRoleKeys } = require("./guildConfigStore");
  const cfg = config ?? getGuildConfig();
  const ids = resolveRoleKeys(getBanAppealApproverRoleKeys(cfg), cfg);
  return ids.some((id) => member?.roles?.cache?.has(id));
}

module.exports = {
  DEFAULT_BAN_APPEAL_APPROVER_ROLE_KEYS,
  getBanAppealApproverRoleKeys,
  memberHasBanAppealApproverRole,
};
