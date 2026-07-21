// utils/assignRepRole.js
const { Reputation } = require("@ralevel/db");
const {
  getGuildConfig,
  getRoleId,
} = require("./guildConfigStore");

/**
 * Recalculate and assign the correct rep tier role to a user, by ID.
 */
async function assignRepRoleById(guild, channel, userId) {
  try {
    if (!guild) return;

    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return;

    const me = guild.members.me;
    if (!me || !me.permissions.has("ManageRoles")) {
      console.warn("[assignRepRoleById] Missing Manage Roles permission.");
      return;
    }

    const rec = (await Reputation.findOne({ userId })) || { rep: 0 };
    const rep = rec.rep || 0;

    const tiers = (getGuildConfig().reputation?.tiers || [])
      .slice()
      .sort((a, b) => b.threshold - a.threshold)
      .map((t) => ({
        amount: t.threshold,
        role: getRoleId(t.roleKey),
        label: t.label || `${t.roleKey} (${t.threshold}+ Rep)`,
      }))
      .filter((t) => t.role);

    const eligible = tiers.find((t) => rep >= t.amount);
    const allTierIds = tiers.map((t) => t.role);
    await member.roles.remove(allTierIds).catch(() => {});

    if (!eligible) return;

    if (!member.roles.cache.has(eligible.role)) {
      await member.roles.add(eligible.role).catch(() => {});
      if (channel) {
        await channel.send(
          `🎉 Congratulations, ${member} has received the **${eligible.label}** role!`,
        );
      }
    }
  } catch (err) {
    console.error("[assignRepRoleById] Error:", err);
  }
}

module.exports = { assignRepRoleById };
