const { getChannelId } = require("./guildConfigStore");

/**
 * Resolve task team id from the interaction's channel using GuildConfig.
 */
function getTaskTeamFromChannel(channelId) {
  if (!channelId) return null;
  if (channelId === getChannelId("graphic")) return "graphic";
  if (channelId === getChannelId("dev")) return "dev";
  if (channelId === getChannelId("writer")) return "writer";
  return null;
}

module.exports = { getTaskTeamFromChannel };
