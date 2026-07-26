const { User } = require("@ralevel/db");
const { getRank, getRanks, handleRanks } = require("../systems/rankSystem");
const { getRoleId } = require("./guildConfigStore");

function buildProgressBar(pct, length = 10) {
  const clamped = Math.max(0, Math.min(100, pct));
  const filled = Math.round((clamped / 100) * length);
  return "█".repeat(filled) + "░".repeat(length - filled);
}

function getNextRank(xp) {
  const ranks = getRanks();
  return ranks.find((rank) => rank.xp > xp) || null;
}

function getRankProgress(xp) {
  const currentRank = getRank(xp);
  const nextRank = getNextRank(xp);
  const currentXpFloor = currentRank?.xp ?? 0;

  if (!nextRank) {
    return {
      currentRank,
      nextRank: null,
      xpToNext: 0,
      progressPct: 100,
      progressBar: buildProgressBar(100),
      progressLabel: "Max rank reached",
    };
  }

  const span = nextRank.xp - currentXpFloor;
  const progress = xp - currentXpFloor;
  const progressPct = span > 0 ? Math.round((progress / span) * 100) : 0;

  return {
    currentRank,
    nextRank,
    xpToNext: nextRank.xp - xp,
    progressPct,
    progressBar: buildProgressBar(progressPct),
    progressLabel: `${xp.toLocaleString()} / ${nextRank.xp.toLocaleString()} XP`,
  };
}

function resolveRankDisplayName(rank, guild) {
  if (rank?.name) return rank.name;
  const roleId = getRoleId(rank?.roleKey || "");
  if (roleId && guild) {
    const role = guild.roles.cache.get(roleId);
    if (role) return role.name;
  }
  return "Unknown Rank";
}

async function getOrCreateUser(guildId, userId) {
  let user = await User.findById(userId);
  if (!user) {
    user = await User.create({
      _id: userId,
      guild_id: guildId,
      xp: 0,
      total_messages: 0,
    });
  }
  return user;
}

async function getServerRank(guildId, xp) {
  const higherCount = await User.countDocuments({
    guild_id: guildId,
    xp: { $gt: xp },
  });
  return higherCount + 1;
}

async function applyXpChange(client, { guildId, userId, newXp }) {
  const user = await getOrCreateUser(guildId, userId);
  const previousXp = user.xp ?? 0;
  const clampedXp = Math.max(0, newXp);

  user.xp = clampedXp;
  await user.save();

  await handleRanks(
    client,
    guildId,
    [{ userId, xp: clampedXp, previousXp }],
    { announce: false },
  );

  return { previousXp, newXp: clampedXp };
}

module.exports = {
  buildProgressBar,
  getNextRank,
  getRankProgress,
  resolveRankDisplayName,
  getOrCreateUser,
  getServerRank,
  applyXpChange,
};
