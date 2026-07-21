const redis = require("../redis");
const { getRoleId, tryGetGuildConfig } = require("../utils/guildConfigStore");

const MESSAGE_KEY_TTL_SEC = 60 * 60 * 72;

function getTodayDate() {
  const now = new Date();
  return now.toISOString().split("T")[0];
}

function buildMessageTrackerPipeline(
  redisClient,
  { countKey, boosterKey, userId, isBooster }
) {
  const pipeline = redisClient.pipeline();
  pipeline.hincrby(countKey, userId, 1);
  pipeline.hset(boosterKey, userId, isBooster ? "true" : "false");
  pipeline.expire(countKey, MESSAGE_KEY_TTL_SEC);
  pipeline.expire(boosterKey, MESSAGE_KEY_TTL_SEC);
  return pipeline;
}

async function handleMessageTracker(message) {
  try {
    const userId = message.author.id;
    const guildId = message.guild.id;
    const date = getTodayDate();

    const countKey = `messages:${guildId}:${date}`;
    const boosterKey = `messages:boosters:${guildId}:${date}`;

    const cfg = tryGetGuildConfig();
    const boosterRoleKey = cfg?.ranks?.boosterRoleKey || "booster";
    const boosterRoleId =
      getRoleId(boosterRoleKey) || process.env.BOOSTER_ROLE_ID || "";
    const isBooster =
      (boosterRoleId &&
        message.member?.roles?.cache?.has(boosterRoleId)) ||
      false;

    const pipeline = buildMessageTrackerPipeline(redis, {
      countKey,
      boosterKey,
      userId,
      isBooster,
    });
    await pipeline.exec();

    // Debug
    // console.log(`+1 → ${userId} | booster: ${isBooster}`);
  } catch (err) {
    console.error("Redis error:", err);
  }
}

module.exports = {
  handleMessageTracker,
  buildMessageTrackerPipeline,
  MESSAGE_KEY_TTL_SEC,
};
