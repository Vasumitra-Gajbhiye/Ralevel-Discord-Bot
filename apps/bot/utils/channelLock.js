/**
 * Shared @everyone SendMessages overwrite helpers.
 * Matches /lock and /unlock behavior.
 */

/**
 * @param {import("discord.js").GuildChannel} channel
 */
async function lockChannel(channel) {
  await channel.permissionOverwrites.edit(channel.guild.roles.everyone, {
    SendMessages: false,
  });
}

/**
 * @param {import("discord.js").GuildChannel} channel
 */
async function unlockChannel(channel) {
  await channel.permissionOverwrites.edit(channel.guild.roles.everyone, {
    SendMessages: null,
  });
}

module.exports = {
  lockChannel,
  unlockChannel,
};
