const { Sticky } = require("@ralevel/db");
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require("discord.js");

const logStickyAction = require("../../utils/logStickyAction");
const { upsertStickyCache } = require("../../systems/sticky");
const { getGuildConfig } = require("../../utils/guildConfigStore");

function formatSticky(content) {
  return `__**Stickied Message:**__\n\n${content}`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("add-sticky")
    .setDescription("Add or replace a sticky message in a channel")
    .addStringOption(option =>
      option
        .setName("message")
        .setDescription("Sticky message (Markdown supported)")
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

    if (!channel.isTextBased()) {
      return interaction.reply({
        content: "❌ Stickies can only be used in text channels.",
        ephemeral: true,
      });
    }

    const perms = channel.permissionsFor(
      interaction.client.user
    );

    if (
      !perms?.has([
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ManageMessages,
      ])
    ) {
      return interaction.reply({
        content:
          "❌ I need Send Messages + Manage Messages permissions.",
        ephemeral: true,
      });
    }

    const content =
      interaction.options.getString("message").replace(/\\n/g, "\n");
    const requestedLineThreshold =
      interaction.options.getInteger("line-threshold");

    let sticky = await Sticky.findOne({
      channelId: channel.id,
    });
    const lineThreshold =
      requestedLineThreshold ??
      sticky?.lineThreshold ??
      getGuildConfig().sticky?.defaultLineThreshold ??
      8;

    if (sticky?.lastMessageId) {
      try {
        await channel.messages.delete(
          sticky.lastMessageId
        );
      } catch {}
    }

    const formatted = formatSticky(content);

    const sent = await channel.send({
      content: formatted,
      allowedMentions: { parse: [] },
    });
    await Sticky.findOneAndUpdate(
      { channelId: channel.id },
      {
        guildId: interaction.guildId,
        channelId: channel.id,
        content, // raw content only
        lineThreshold,
        lastMessageId: sent.id,
        enabled: true,
      },
      { upsert: true }
    );

    upsertStickyCache(interaction.client, {
      channelId: channel.id,
      content,
      lineThreshold,
      lastMessageId: sent.id,
      enabled: true,
    });

    await interaction.reply({
      content: `✅ Sticky added in ${channel}.`,
      ephemeral: true,
    });

    await logStickyAction({
      guildId: interaction.guildId,
      channelId: channel.id,
      moderator: interaction.user,
      action: "ADD",
      content,
      lineThreshold,
    });
  },
};