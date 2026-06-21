require("dotenv").config();
const connectDB = require("../database");
const redis = require("../redis");
const User = require("../models/User");
const handleRanks = require("../systems/rankSystem");

const LOCK_TTL_PROCESSING_SEC = 60 * 60;
const LOCK_TTL_COMPLETED_SEC = 60 * 60 * 24 * 7;

function getFinalizeDate() {
  const now = new Date();
  now.setDate(now.getDate() - 1);
  return now.toISOString().split("T")[0];
}

function getFinalizeLockKey(guildId, date) {
  return `processed:${guildId}:${date}`;
}

async function fetchLegacyUserHashes(keys, chunkSize = 50) {
  const result = new Map();

  for (let i = 0; i < keys.length; i += chunkSize) {
    const chunk = keys.slice(i, i + chunkSize);
    const pipeline = redis.pipeline();
    chunk.forEach((key) => pipeline.hgetall(key));
    const replies = await pipeline.exec();

    chunk.forEach((key, idx) => {
      const [err, data] = replies[idx];
      if (err) throw err;
      result.set(key, data);
    });
  }

  return result;
}

function buildUserUpdates(userIds, counts, boosters, userMap, guildId) {
  const operations = [];
  const usersForRanking = [];

  for (const userId of userIds) {
    const count = parseInt(counts[userId] || "0", 10);
    const isBooster =
      boosters[userId] === "true" || boosters[userId] === true;
    const xpGained = isBooster ? count * 2 : count;

    const existingUser = userMap[userId];
    const previousXp = existingUser?.xp || 0;

    usersForRanking.push({
      userId,
      previousXp,
      xp: previousXp + xpGained,
    });

    operations.push({
      updateOne: {
        filter: { _id: userId },
        update: {
          $inc: {
            total_messages: count,
            xp: xpGained,
          },
          $set: { guild_id: guildId },
        },
        upsert: true,
      },
    });
  }

  return { operations, usersForRanking };
}

async function finalize(client) {
  const guildId = process.env.GUILD_ID;
  const date = getFinalizeDate();
  const lockKey = getFinalizeLockKey(guildId, date);

  try {
    await connectDB();

    const countKey = `messages:${guildId}:${date}`;
    const boosterKey = `messages:boosters:${guildId}:${date}`;
    const usersSetKey = `messages:users:${guildId}:${date}`;

    console.log(`📥 Processing message data for ${date}`);

    const acquired = await redis.set(
      lockKey,
      "true",
      "EX",
      LOCK_TTL_PROCESSING_SEC,
      "NX"
    );
    if (!acquired) {
      console.log("⚠️ Already processed or in progress. Skipping.");
      return;
    }

    let userIds = [];
    let counts = {};
    let boosters = {};
    let legacyKeys = [];

    const [countsData, boostersData] = await Promise.all([
      redis.hgetall(countKey),
      redis.hgetall(boosterKey),
    ]);

    if (countsData && Object.keys(countsData).length > 0) {
      counts = countsData;
      boosters = boostersData || {};
      userIds = Object.keys(counts);
      console.log(`Found ${userIds.length} users (aggregate hash)`);
    } else {
      const legacyUserIds = await redis.smembers(usersSetKey);

      if (!legacyUserIds || legacyUserIds.length === 0) {
        console.log("⚠️ No data found");
        await redis.del(lockKey);
        return;
      }

      legacyKeys = legacyUserIds.map(
        (userId) => `messages:${guildId}:${date}:${userId}`
      );
      const legacyHashes = await fetchLegacyUserHashes(legacyKeys);

      for (const key of legacyKeys) {
        const userId = key.split(":").pop();
        const data = legacyHashes.get(key) || {};
        counts[userId] = data.count || "0";
        boosters[userId] = data.booster || "false";
      }

      userIds = legacyUserIds;
      console.log(`Found ${userIds.length} users (legacy per-user keys)`);
    }

    const existingUsers = await User.find({ _id: { $in: userIds } });

    const userMap = {};
    for (const u of existingUsers) {
      userMap[u._id] = u;
    }

    const { operations, usersForRanking } = buildUserUpdates(
      userIds,
      counts,
      boosters,
      userMap,
      guildId
    );

    if (operations.length > 0) {
      await User.bulkWrite(operations);
    }

    console.log("✅ MongoDB updated (XP included)");

    await handleRanks(client, guildId, usersForRanking);

    await redis.set(lockKey, "true", "EX", LOCK_TTL_COMPLETED_SEC);

    await Promise.all([
      redis.del(countKey),
      redis.del(boosterKey),
      redis.del(usersSetKey),
      ...legacyKeys.map((key) => redis.del(key)),
    ]);

    console.log("🧹 Redis cleaned up");
  } catch (err) {
    console.error("❌ Finalize Error:", err);
    await redis.del(lockKey);
  }
}

module.exports = finalize;
module.exports.getFinalizeDate = getFinalizeDate;
module.exports.getFinalizeLockKey = getFinalizeLockKey;
module.exports.fetchLegacyUserHashes = fetchLegacyUserHashes;
module.exports.buildUserUpdates = buildUserUpdates;
// DO NOT DELETE THE COMMENT BELOW
// HSET messages:1430847370807083132:2026-03-30:1058932081629069363 count 10 booster true
// HSET messages:1430847370807083132:2026-03-30:878194355473637397 count 5 booster false
