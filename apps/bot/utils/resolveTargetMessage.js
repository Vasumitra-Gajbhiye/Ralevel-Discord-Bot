const parseMessageReference = require("./parseMessageReference");

/**
 * Resolve a target message from slash command options.
 * @param {import("discord.js").ChatInputCommandInteraction} interaction
 * @param {string} rawInput
 * @returns {Promise<{ msg: import("discord.js").Message } | { error: string }>}
 */
async function resolveTargetMessage(interaction, rawInput) {
  const parsed = parseMessageReference(rawInput, interaction.guild.id);
  if (parsed.error) return { error: parsed.error };

  let channel;
  if (parsed.channelId) {
    const channelOption = interaction.options.getChannel("channel");
    if (channelOption && channelOption.id !== parsed.channelId) {
      return {
        error:
          "❌ The channel option does not match the channel in the message link.",
      };
    }

    channel = await interaction.guild.channels
      .fetch(parsed.channelId)
      .catch(() => null);
  } else {
    channel =
      interaction.options.getChannel("channel") || interaction.channel;
  }

  if (!channel?.isTextBased?.()) {
    return {
      error: "❌ Channel not found or is not a text channel.",
    };
  }

  const msg = await channel.messages.fetch(parsed.messageId).catch(() => null);
  if (!msg) {
    return {
      error: `❌ Message not found in <#${channel.id}>. Make sure the ID is correct.`,
    };
  }

  return { msg };
}

module.exports = resolveTargetMessage;
