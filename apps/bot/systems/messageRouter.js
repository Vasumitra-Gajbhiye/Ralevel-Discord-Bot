const { Events } = require("discord.js");
const { tryGetGuildConfig } = require("../utils/guildConfigStore");

function toIds(list) {
  return (list ?? [])
    .map((entry) => (typeof entry === "string" ? entry : entry?.id))
    .filter(Boolean);
}

function isDisabledInLists(message, disabledChannels, disabledCategories) {
  const channelIds = toIds(disabledChannels);
  const categoryIds = toIds(disabledCategories);
  if (channelIds.includes(message.channel.id)) return true;
  if (
    message.channel.parentId &&
    categoryIds.includes(message.channel.parentId)
  ) {
    return true;
  }
  return false;
}

function isReputationDisabled(message) {
  const cfg = tryGetGuildConfig();
  if (cfg?.reputation) {
    const { disabledChannels = [], disabledCategories = [] } = cfg.reputation;
    return isDisabledInLists(message, disabledChannels, disabledCategories);
  }

  // Env fallback (verify scripts / pre-config)
  const disabledChannels = process.env.DISABLED_CHANNELS;
  const disabledCategories = process.env.DISABLED_CATEGORIES;

  if (disabledChannels?.includes?.(message.channel.id)) return true;
  if (
    message.channel.parentId &&
    disabledCategories?.includes?.(message.channel.parentId)
  ) {
    return true;
  }
  return false;
}

function isXpDisabled(message) {
  const cfg = tryGetGuildConfig();
  if (!cfg?.ranks) return false;

  const { disabledChannels = [], disabledCategories = [] } = cfg.ranks;
  return isDisabledInLists(message, disabledChannels, disabledCategories);
}

module.exports = function messageRouter(client, handlers) {
  const { handleMessageTracker, handleSticky, handleReputation } = handlers;

  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot || !message.guild) return;

    const cfg = tryGetGuildConfig();
    const tasks = [];

    if (!isXpDisabled(message)) {
      tasks.push(handleMessageTracker(message));
    }

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
module.exports.isXpDisabled = isXpDisabled;
