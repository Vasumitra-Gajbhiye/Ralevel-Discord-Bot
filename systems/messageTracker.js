const redis = require("../redis");

// const BOOSTER_ROLE_ID = "1117393047861346335";
// const BOOSTER_ROLE_ID = "1487420818148557011";
const BOOSTER_ROLE_ID = process.env.BOOSTER_ROLE_ID;

function getTodayDate() {
  const now = new Date();
  return now.toISOString().split("T")[0];
}

module.exports = (client) => {
  client.on("messageCreate", async (message) => {
    try {
      if (message.author.bot) return;
      if (!message.guild) return;

      const userId = message.author.id;
      const guildId = message.guild.id;
      const date = getTodayDate();

      const key = `messages:${guildId}:${date}:${userId}`;

      // 🔍 Check booster role
      const isBooster =
        message.member?.roles?.cache?.has(BOOSTER_ROLE_ID) || false;

      // 🔥 Increment message count
      await redis.hincrby(key, "count", 1);

      // 🔥 Set booster status (overwrite is fine)
      await redis.hset(key, { booster: isBooster ? "true" : "false" });

      // Debug
      // console.log(`+1 → ${userId} | booster: ${isBooster}`);
    } catch (err) {
      console.error("Redis error:", err);
    }
  });
};
