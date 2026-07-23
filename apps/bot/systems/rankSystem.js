// systems/rankSystem.js
const {
  getGuildConfig,
  getChannelId,
  getRoleId,
} = require("../utils/guildConfigStore");

const RANK_UPDATE_CONCURRENCY = 5;

function getRanks() {
  const ladder = getGuildConfig().ranks?.ladder || [];
  return ladder.length ? ladder : [{ roleKey: "", xp: 0 }];
}

function resolveRankRoleId(rank) {
  return getRoleId(rank?.roleKey || "");
}

function getRank(xp) {
  const RANKS = getRanks();
  let currentRank = RANKS[0];

  for (const rank of RANKS) {
    if (xp >= rank.xp) {
      currentRank = rank;
    }
  }

  return currentRank;
}

function filterRankChanges(users) {
  return users
    .map(({ userId, xp, previousXp }) => ({
      userId,
      newRank: getRank(xp),
      oldRank: getRank(previousXp),
    }))
    .filter(({ oldRank, newRank }) => oldRank.roleKey !== newRank.roleKey);
}

async function handleRanks(client, guildId, users) {
  try {
    const cfg = getGuildConfig();
    if (cfg.features && cfg.features.xpRanks === false) return;

    const rankChanges = filterRankChanges(users);
    if (rankChanges.length === 0) return;

    const guild = await client.guilds.fetch(guildId);
    const channelKey = cfg.ranks?.levelUpChannelKey || "levelUp";
    const announceChannelId = getChannelId(channelKey);
    const channel = announceChannelId
      ? await guild.channels.fetch(announceChannelId).catch(() => null)
      : null;

    const ALL_RANK_ROLE_IDS = getRanks()
      .map((rank) => resolveRankRoleId(rank))
      .filter(Boolean);

    async function processRankChange({ userId, newRank }) {
      const member = await guild.members.fetch(userId).catch(() => null);
      if (!member) return;

      await member.roles.remove(ALL_RANK_ROLE_IDS).catch(() => {});
      const newRoleId = resolveRankRoleId(newRank);
      if (newRoleId) {
        await member.roles.add(newRoleId).catch(() => {});
      }

      if (!channel) return;
      const role = guild.roles.cache.get(newRoleId);
      await channel
        .send(
          `🎉 <@${userId}> ranked up! You are now **${
            role?.name || "Unknown Role"
          }**`,
        )
        .catch(() => {});
    }

    for (let i = 0; i < rankChanges.length; i += RANK_UPDATE_CONCURRENCY) {
      const batch = rankChanges.slice(i, i + RANK_UPDATE_CONCURRENCY);
      await Promise.all(batch.map(processRankChange));
    }
  } catch (err) {
    console.error("[rankSystem] Error:", err);
  }
}

module.exports = handleRanks;
Object.assign(module.exports, {
  handleRanks,
  getRank,
  getRanks,
  filterRankChanges,
  RANK_UPDATE_CONCURRENCY,
});
