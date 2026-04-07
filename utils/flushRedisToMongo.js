require("dotenv").config();
const connectDB = require("../database");
const redis = require("../redis");
const User = require("../models/User");

function getTodayDate() {
  const now = new Date();
  return now.toISOString().split("T")[0];
}

async function flush() {
  try {
    await connectDB();

    const guildId = process.env.GUILD_ID;
    const date = getTodayDate();

    const key = `messages:${guildId}:${date}`;

    console.log(`📥 Reading Redis key: ${key}`);

    const data = await redis.hgetall(key);

    if (!data || Object.keys(data).length === 0) {
      console.log("⚠️ No data found in Redis");
      return;
    }

    console.log(`Found ${Object.keys(data).length} users`);

    for (const [userId, count] of Object.entries(data)) {
      const increment = parseInt(count);

      await User.updateOne(
        { _id: userId },
        {
          $inc: { total_messages: increment },
          $set: { guild_id: guildId },
        },
        { upsert: true }
      );
    }

    console.log("✅ MongoDB updated successfully");
    process.exit(0);
  } catch (err) {
    console.error("❌ Error:", err);
    process.exit(1);
  }
}

flush();
