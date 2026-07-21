// utils/assignRepRole.js
const { Reputation } = require("@ralevel/db");

/**
 * Recalculate and assign the correct rep tier role to a user, by ID.
 * Works from slash commands (uses guild + channel instead of message).
 * Uses role IDs only.
 */
async function assignRepRoleById(guild, channel, userId) {
  try {
    if (!guild) return;

    // Fetch a full GuildMember
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return;

    // Check bot can manage roles
    const me = guild.members.me;
    if (!me || !me.permissions.has("ManageRoles")) {
      console.warn("[assignRepRoleById] Missing Manage Roles permission.");
      return;
    }

    // Load reputation
    const rec = (await Reputation.findOne({ userId })) || { rep: 0 };
    const rep = rec.rep || 0;

    // Define tiers (highest → lowest)
    const TIERS = [
      {
        amount: 1000,
        role: process.env.GIGACHAD_ROLE_ID,
        label: "Giga Chad (1000+ Rep)",
      },
      {
        amount: 500,
        role: process.env.EXPERT_ROLE_ID,
        label: "Expert (500+ Rep)",
      },
      {
        amount: 100,
        role: process.env.ADVANCED_ROLE_ID,
        label: "Advance (100+ Rep)",
      },
      {
        amount: 50,
        role: process.env.INTERMEDIATE_ROLE_ID,
        label: "Intermediate (50+ Rep)",
      },
      {
        amount: 10,
        role: process.env.ROLE_BEGINNER_ROLE_ID,
        label: "Beginner (10+ Rep)",
      },
    ];

    // Compute correct tier
    const eligible = TIERS.find((t) => rep >= t.amount);

    // Remove all tier roles first (so the user has at most one)
    const allTierIds = TIERS.map((t) => t.role);
    await member.roles.remove(allTierIds).catch(() => {});

    // If no tier (rep < 10), stop after cleanup
    if (!eligible) return;

    // Add the right tier role (role ID)
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
