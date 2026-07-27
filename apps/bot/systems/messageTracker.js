const redis = require("../redis");
const { XpBan } = require("@ralevel/db");
const { getRoleId, tryGetGuildConfig } = require("../utils/guildConfigStore");
const {
  getPendingKey,
  getBoosterKey,
  PENDING_KEY_TTL_SEC,
} = require("../utils/xpKeys");

function buildMessageTrackerPipeline(
  redisClient,
  { countKey, boosterKey, userId, isBooster }
) {
  const pipeline = redisClient.pipeline();
  pipeline.hincrby(countKey, userId, 1);
  pipeline.hset(boosterKey, userId, isBooster ? "true" : "false");
  pipeline.expire(countKey, PENDING_KEY_TTL_SEC);
  pipeline.expire(boosterKey, PENDING_KEY_TTL_SEC);
  return pipeline;
}

async function handleMessageTracker(message) {
  try {
    const userId = message.author.id;
    if (await XpBan.exists({ userId })) return;

    const guildId = message.guild.id;
    const countKey = getPendingKey(guildId);
    const boosterKey = getBoosterKey(guildId);

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
  } catch (err) {
    console.error("Redis error:", err);
  }
}

module.exports = {
  handleMessageTracker,
  buildMessageTrackerPipeline,
  MESSAGE_KEY_TTL_SEC: PENDING_KEY_TTL_SEC,
  PENDING_KEY_TTL_SEC,
};
