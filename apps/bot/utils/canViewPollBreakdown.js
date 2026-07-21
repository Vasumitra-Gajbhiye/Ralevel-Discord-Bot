require("../loadEnv");

const BREAKDOWN_ROLE_IDS = [
  process.env.ADMIN_ROLE_ID,
  process.env.DC_HEAD_ROLE_ID,
  process.env.SR_MOD_ROLE_ID,
  process.env.JR_MOD_ROLE_ID,
].filter(Boolean);

function canViewPollBreakdown(member) {
  if (!member) return false;
  return member.roles.cache.some((role) =>
    BREAKDOWN_ROLE_IDS.includes(role.id),
  );
}

module.exports = canViewPollBreakdown;
