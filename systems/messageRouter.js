const { Events } = require("discord.js");

function isReputationDisabled(message) {
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

module.exports = function messageRouter(client, handlers) {
  const { handleMessageTracker, handleSticky, handleReputation } = handlers;

  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot || !message.guild) return;

    const tasks = [handleMessageTracker(message), handleSticky(message)];

    if (!isReputationDisabled(message)) {
      tasks.push(handleReputation(message));
    }

    await Promise.all(tasks);
  });
};

module.exports.isReputationDisabled = isReputationDisabled;
