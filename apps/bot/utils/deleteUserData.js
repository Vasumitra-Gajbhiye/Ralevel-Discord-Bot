const redis = require("../redis");
const {
  User,
  Reputation,
  RepGrant,
  Poll,
  PollVote,
  XpFlushGrant,
  UserPrivacy,
} = require("@ralevel/db");
const { getRanks } = require("../systems/rankSystem");
const { ensureTierRoleAndCheckAdded } = require("./repAwards");
const { getPendingXpOverlay } = require("./xpFlush");
const { getRoleId, tryGetGuildConfig } = require("./guildConfigStore");
const {
  FLUSH_LOCK_TTL_SEC,
  getPendingKey,
  getBoosterKey,
  getFlushLockKey,
} = require("./xpKeys");

const DELETE_COOLDOWN_MS = 24 * 60 * 60 * 1000;

async function getDeletionCooldownRemaining(userId, now = Date.now()) {
  const doc = await UserPrivacy.findOne({ userId })
    .select("dataDeletedAt")
    .lean();
  const last = doc?.dataDeletedAt ? new Date(doc.dataDeletedAt).getTime() : 0;
  return Math.max(0, last + DELETE_COOLDOWN_MS - now);
}

async function getStoredUserData(guildId, userId) {
  const [user, rep, pollVotes, legacyPollVotes, pending, privacy] =
    await Promise.all([
      User.findById(userId).select("xp total_messages").lean(),
      Reputation.findOne({ userId }).select("rep").lean(),
      PollVote.countDocuments({ userId }),
      Poll.countDocuments({ "votes.userId": userId }),
      getPendingXpOverlay(guildId, userId),
      UserPrivacy.findOne({ userId }).lean(),
    ]);

  return {
    xp: (user?.xp || 0) + pending.xp,
    messages: (user?.total_messages || 0) + pending.messages,
    rep: rep?.rep || 0,
    pollVotes: pollVotes + legacyPollVotes,
    contentOptOut: privacy?.contentOptOut === true,
  };
}

function scanKeys(pattern) {
  return new Promise((resolve, reject) => {
    const keys = [];
    const stream = redis.scanStream({ match: pattern, count: 100 });
    stream.on("data", (batch) => keys.push(...batch));
    stream.on("end", () => resolve(keys));
    stream.on("error", reject);
  });
}

// Pending hashes plus any drain a crashed flush left behind, which
// resumeOrphanDrains would otherwise re-apply on the next startup.
async function clearPendingXp(guildId, userId) {
  const [draining, drainingBoosters] = await Promise.all([
    scanKeys(`xp:draining:${guildId}:*`),
    scanKeys(`xp:draining-boosters:${guildId}:*`),
  ]);

  const pipeline = redis.pipeline();
  pipeline.hdel(getPendingKey(guildId), userId);
  pipeline.hdel(getBoosterKey(guildId), userId);
  for (const key of [...draining, ...drainingBoosters]) {
    pipeline.hdel(key, userId);
  }
  const results = await pipeline.exec();
  return results[0]?.[1] > 0;
}

// Rank and tier roles come from the XP/rep we just deleted. Skipped when the
// feature is off, since the bot isn't managing those roles then.
async function removeEngagementRoles(guild, userId) {
  const removed = { rankRoles: 0, repRoles: false };
  if (!guild) return removed;

  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return removed;

  const features = tryGetGuildConfig()?.features || {};
  try {
    if (features.xpRanks !== false) {
      const held = getRanks()
        .map((rank) => getRoleId(rank.roleKey || ""))
        .filter((id) => id && member.roles.cache.has(id));
      if (held.length) {
        await member.roles.remove(held);
        removed.rankRoles = held.length;
      }
    }
  } catch (err) {
    console.error("[privacy] rank role removal failed:", err);
  }

  if (features.reputation !== false) {
    // rep 0 removes every tier role
    await ensureTierRoleAndCheckAdded(guild, member, null, 0);
    removed.repRoles = true;
  }

  return removed;
}

/**
 * Deletes the member's engagement data: XP/message count, reputation, rep
 * grants they gave or received, poll votes and pending XP. Never touches moderation records, modmail, confessions,
 * certificates or xp/rep bans. Keeps the UserPrivacy preference.
 * Holds the XP flush lock so a running flush can't recreate the User doc.
 */
async function deleteUserData({ guild, guildId, userId }) {
  const lockKey = getFlushLockKey(guildId);
  const acquired = await redis.set(
    lockKey,
    "1",
    "EX",
    FLUSH_LOCK_TTL_SEC,
    "NX"
  );
  if (!acquired) return { busy: true };

  let deleted;
  try {
    const pendingXp = await clearPendingXp(guildId, userId);
    const [user, rep, repGrants, votes, legacyVotes, grants] = await Promise.all([
      User.deleteOne({ _id: userId }),
      Reputation.deleteOne({ userId }),
      RepGrant.deleteMany({ $or: [{ giverId: userId }, { receiverId: userId }] }),
      PollVote.deleteMany({ userId }),
      Poll.updateMany(
        { "votes.userId": userId },
        { $pull: { votes: { userId } } }
      ),
      XpFlushGrant.deleteMany({ userId }),
    ]);
    await UserPrivacy.updateOne(
      { userId },
      { $set: { dataDeletedAt: new Date() } },
      { upsert: true }
    );

    deleted = {
      user: user.deletedCount || 0,
      reputation: rep.deletedCount || 0,
      repGrants: repGrants.deletedCount || 0,
      pollVotes: (votes.deletedCount || 0) + (legacyVotes.modifiedCount || 0),
      xpGrants: grants.deletedCount || 0,
      pendingXp,
    };
  } finally {
    await redis.del(lockKey);
  }

  const roles = await removeEngagementRoles(guild, userId);

  console.log(
    `[privacy] delete-my-data user=${userId} userDoc=${deleted.user} reputation=${deleted.reputation} repGrants=${deleted.repGrants} pollVotes=${deleted.pollVotes} xpGrants=${deleted.xpGrants} pendingXp=${deleted.pendingXp} rankRoles=${roles.rankRoles} repRoles=${roles.repRoles}`
  );

  return { busy: false, deleted, roles };
}

module.exports = {
  DELETE_COOLDOWN_MS,
  getDeletionCooldownRemaining,
  getStoredUserData,
  deleteUserData,
  removeEngagementRoles,
};
