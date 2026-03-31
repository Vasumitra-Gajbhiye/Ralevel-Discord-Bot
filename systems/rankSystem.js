// systems/rankSystem.js

// TESTING SERVER INFO
// const RANKS = [
//   { roleId: "1487448375971545250", xp: 0 },
//   { roleId: "1487448434133827716", xp: 10 },
//   { roleId: "1487448454685917204", xp: 20 },
//   { roleId: "1487448484964597970", xp: 30 },
// ];

// MAIN SERVER INFO
const RANKS = [
  { roleId: "1487405095627915315", xp: 0 },
  { roleId: "1487405099440668782", xp: 20 },
  { roleId: "1487405103244644404", xp: 100 },
  { roleId: "1487405107929813052", xp: 250 },
  { roleId: "1487405111935238266", xp: 500 },
  { roleId: "1487405115735281744", xp: 1000 },
  { roleId: "1487405119527059486", xp: 2500 },
  { roleId: "1487405123058536642", xp: 5000 },
  { roleId: "1487405128641282048", xp: 10000 },
  { roleId: "1487405132911214614", xp: 15000 },
  { roleId: "1487405136757395547", xp: 20000 },
  { roleId: "1487405140897173536", xp: 30000 },
  { roleId: "1487405144852140123", xp: 50000 },
  { roleId: "1487405149184852068", xp: 75000 },
  { roleId: "1487405153207189605", xp: 100000 },
];

const ANNOUNCE_CHANNEL_ID = process.env.LEVELUP_CHANNEL_ID;
// 1127986149634359316

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
      console.log("1");
      const member = await guild.members.fetch(userId).catch(() => null);
      if (!member) continue;
      console.log("2");

      // 🔄 Remove old roles
      const allRankRoleIds = RANKS.map((r) => r.roleId);
      await member.roles.remove(allRankRoleIds).catch(() => {});

      // ✅ Add new role
      await member.roles.add(newRank.roleId).catch(() => {});

      // 📢 Send message
      const role = guild.roles.cache.get(newRank.roleId);

      await channel.send(
        `🎉 <@${userId}> ranked up! You are now **${
          role?.name || "Unknown Role"
        }**`
      );

      console.log("sent");
    }
  } catch (err) {
    console.error("Rank system error:", err);
  }
};
