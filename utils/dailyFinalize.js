require("dotenv").config();
const connectDB = require("../database");
const redis = require("../redis");
const User = require("../models/User");
const handleRanks = require("../systems/rankSystem");

function getYesterdayDate() {
  const now = new Date();
  now.setDate(now.getDate() - 1);
  return now.toISOString().split("T")[0];
}

async function finalize(client) {
  try {
    await connectDB();

    const guildId = process.env.GUILD_ID;
    const date = getYesterdayDate();

    const usersForRanking = [];

    const pattern = `messages:${guildId}:${date}:*`;
    const lockKey = `processed:${guildId}:${date}`;

    console.log(`📥 Processing pattern: ${pattern}`);

    const alreadyProcessed = await redis.get(lockKey);
    if (alreadyProcessed) {
      console.log("⚠️ Already processed. Skipping.");
      return;
    }

    const keys = await redis.keys(pattern);

    if (!keys || keys.length === 0) {
      console.log("⚠️ No data found");
      return;
    }

    console.log(`Found ${keys.length} users`);

    const operations = [];

    const userIds = keys.map((k) => k.split(":").pop());
    const existingUsers = await User.find({ _id: { $in: userIds } });

    const userMap = {};
    for (const u of existingUsers) {
      userMap[u._id] = u;
    }

    for (const key of keys) {
      const userId = key.split(":").pop();
      const data = await redis.hgetall(key);

      const count = parseInt(data.count || "0");
      const isBooster = data.booster === "true" || data.booster === true;

      const xpGained = isBooster ? count * 2 : count;

      const existingUser = userMap[userId];
      const previousXp = existingUser?.xp || 0;
      const newXp = previousXp + xpGained;

      usersForRanking.push({
        userId,
        previousXp,
        xp: newXp,
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

    if (operations.length > 0) {
      await User.bulkWrite(operations);
    }

    console.log("✅ MongoDB updated (XP included)");

    await handleRanks(client, guildId, usersForRanking);

    await redis.set(lockKey, "true", { ex: 60 * 60 * 24 * 7 });

    await Promise.all(keys.map((key) => redis.del(key)));

    console.log("🧹 Redis cleaned up");
  } catch (err) {
    console.error("❌ Finalize Error:", err);
  }
}

module.exports = finalize;
// DO NOT DELETE THE COMMENT BELOW
// HSET messages:1430847370807083132:2026-03-30:1058932081629069363 count 10 booster true
// HSET messages:1430847370807083132:2026-03-30:878194355473637397 count 5 booster false
