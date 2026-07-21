const { Sticky } = require("@ralevel/db");
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require("discord.js");

const logStickyAction = require("../../utils/logStickyAction");
const { upsertStickyCache } = require("../../systems/sticky");

const DEFAULT_LINE_THRESHOLD = 8;

module.exports = {
  data: new SlashCommandBuilder()
    .setName("edit-sticky")
    .setDescription("Edit the sticky message in a channel")
    .addStringOption(option =>
      option
        .setName("message")
        .setDescription("New sticky message (Markdown supported)")
        .setRequired(true)
    )
    .addChannelOption(option =>
      option
        .setName("channel")
        .setDescription("Channel (defaults to current)")
        .setRequired(false)
    )
    .addIntegerOption(option =>
      option
        .setName("line-threshold")
        .setDescription(
          "Number of message lines before the sticky is reposted"
        )
        .setMinValue(1)
        .setMaxValue(1000)
        .setRequired(false)
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageMessages
    ),

  async execute(interaction) {
    const channel =
      interaction.options.getChannel("channel") ||
      interaction.channel;

    const newContent =
      interaction.options.getString("message").replace(/\\n/g, "\n");
    const requestedLineThreshold =
      interaction.options.getInteger("line-threshold");

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

    const lineThreshold =
      requestedLineThreshold ??
      sticky.lineThreshold ??
      DEFAULT_LINE_THRESHOLD;

    // Delete old sticky message
    if (sticky.lastMessageId) {
      try {
        await channel.messages.delete(
          sticky.lastMessageId
        );
      } catch {}
    }

    const formatted =
      `__**Stickied Message:**__\n\n${newContent}`;

    const sent = await channel.send({
      content: formatted,
      allowedMentions: { parse: [] },
    });

    sticky.content = newContent;
    sticky.lineThreshold = lineThreshold;
    sticky.lastMessageId = sent.id;
    await sticky.save();

    upsertStickyCache(interaction.client, {
      channelId: channel.id,
      content: newContent,
      lineThreshold,
      lastMessageId: sent.id,
      enabled: sticky.enabled,
    });

    await interaction.reply({
      content: `✏️ Sticky updated in ${channel}.`,
      ephemeral: true,
    });

    await logStickyAction({
      guildId: interaction.guildId,
      channelId: channel.id,
      moderator: interaction.user,
      action: "EDIT",
      content: newContent,
      lineThreshold,
    });
  },
};