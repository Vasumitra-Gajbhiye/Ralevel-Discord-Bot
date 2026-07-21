const { Sticky } = require("@ralevel/db");
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require("discord.js");

const logStickyAction = require("../../utils/logStickyAction");
const { upsertStickyCache } = require("../../systems/sticky");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("sticky-resend")
    .setDescription("Force resend the sticky message")
    .addChannelOption(option =>
      option
        .setName("channel")
        .setDescription("Channel (defaults to current)")
        .setRequired(false)
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageMessages
    ),

  async execute(interaction) {
    const channel =
      interaction.options.getChannel("channel") ||
      interaction.channel;

    if (!channel.isTextBased()) {
      return interaction.reply({
        content: "❌ This is not a text channel.",
        ephemeral: true,
      });
    }

    const sticky = await Sticky.findOne({
      channelId: channel.id,
    });

    if (!sticky) {
      return interaction.reply({
        content: "ℹ️ No sticky exists in this channel.",
        ephemeral: true,
      });
    }

    if (sticky.lastMessageId) {
      try {
        await channel.messages.delete(
          sticky.lastMessageId
        );
      } catch {}
    }

    const formatted =
      `__**Stickied Message:**__\n\n${sticky.content}`;

    const sent = await channel.send({
      content: formatted,
      allowedMentions: { parse: [] },
    });

    sticky.lastMessageId = sent.id;
    await sticky.save();

    upsertStickyCache(interaction.client, {
      channelId: channel.id,
      content: sticky.content,
      lineThreshold: sticky.lineThreshold,
      lastMessageId: sent.id,
      enabled: sticky.enabled,
    });

    await interaction.reply({
      content: `🔁 Sticky resent in ${channel}.`,
      ephemeral: true,
    });

    await logStickyAction({
  guildId: interaction.guildId,
  channelId: channel.id,
  moderator: interaction.user,
  action: "RESEND",
});
  },
};