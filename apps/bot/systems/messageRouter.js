const { Events } = require("discord.js");
const { tryGetGuildConfig } = require("../utils/guildConfigStore");

function toIds(list) {
  return (list ?? [])
    .map((entry) => (typeof entry === "string" ? entry : entry?.id))
    .filter(Boolean);
}

function isReputationDisabled(message) {
  const cfg = tryGetGuildConfig();
  if (cfg?.reputation) {
    const {
      disabledChannels = [],
      disabledCategories = [],
      staffChannelIds = [],
    } = cfg.reputation;
    const channelIds = toIds(disabledChannels);
    const categoryIds = toIds(disabledCategories);
    const staffIds = toIds(staffChannelIds);
    if (channelIds.includes(message.channel.id)) return true;
    if (staffIds.includes(message.channel.id)) return true;
    if (
      message.channel.parentId &&
      categoryIds.includes(message.channel.parentId)
    ) {
      return true;
    }
    return false;
  }

  // Env fallback (verify scripts / pre-config)
  const disabledChannels = process.env.DISABLED_CHANNELS;
  const disabledCategories = process.env.DISABLED_CATEGORIES;
  const staffChannels = process.env.STAFF_CHANNEL_IDS;

  if (disabledChannels?.includes?.(message.channel.id)) return true;
  if (staffChannels?.includes?.(message.channel.id)) return true;
  if (
    message.channel.parentId &&
    disabledCategories?.includes?.(message.channel.parentId)
  ) {
    return true;
  }
  return false;
}

module.exports = function messageRouter(client, handlers) {
  const { handleMessageTracker, handleSticky, handleReputation } = handlers;

  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot || !message.guild) return;

    const cfg = tryGetGuildConfig();
    const tasks = [handleMessageTracker(message)];

    if (!cfg?.features || cfg.features.sticky !== false) {
      tasks.push(handleSticky(message));
    }

    if (
      (!cfg?.features || cfg.features.reputation !== false) &&
      !isReputationDisabled(message)
    ) {
      tasks.push(handleReputation(message));
    }

    await Promise.all(tasks);
  });
};

module.exports.isReputationDisabled = isReputationDisabled;
