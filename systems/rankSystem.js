// systems/rankSystem.js

const RANKS = [
  { roleId: "1487448375971545250", xp: 0 },
  { roleId: "1487448434133827716", xp: 10 },
  { roleId: "1487448454685917204", xp: 20 },
  { roleId: "1487448484964597970", xp: 30 },
];

const ANNOUNCE_CHANNEL_ID = "1487448975517810938";

// 🔍 Get correct rank based on XP
function getRank(xp) {
  let currentRank = RANKS[0];

  for (const rank of RANKS) {
    if (xp >= rank.xp) {
      currentRank = rank;
    }
  }

  return currentRank;
}

module.exports = async function handleRanks(client, guildId, users) {
  try {
    const guild = await client.guilds.fetch(guildId);
    const channel = await guild.channels.fetch(ANNOUNCE_CHANNEL_ID);

    for (const user of users) {
      const { userId, xp, previousXp } = user;

      const oldRank = getRank(previousXp);
      const newRank = getRank(xp);

      // 🚫 No rank change
      if (oldRank.roleId === newRank.roleId) continue;

      const member = await guild.members.fetch(userId).catch(() => null);
      if (!member) continue;

      // 🔄 Remove old roles
      const allRankRoleIds = RANKS.map((r) => r.roleId);
      await member.roles.remove(allRankRoleIds).catch(() => {});

      // ✅ Add new role
      await member.roles.add(newRank.roleId).catch(() => {});

      // 📢 Send message
      await channel.send(
        `🎉 <@${userId}> ranked up! You are now <@&${newRank.roleId}>`
      );
    }
  } catch (err) {
    console.error("Rank system error:", err);
  }
};
