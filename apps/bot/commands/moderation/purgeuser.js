const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  ChannelType,
} = require("discord.js");

const generateId = require("../../utils/generateId.js");
const logModAction = require("../../utils/logModAction");
const { purgeUserMessages } = require("../../utils/purgeUserMessages");

const PROGRESS_UPDATE_INTERVAL = 5;

module.exports = {
  data: new SlashCommandBuilder()
    .setName("purgeuser")
    .setDescription(
      "Delete a user's messages across channels from the last N days.",
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addUserOption((opt) =>
      opt
        .setName("user")
        .setDescription("User whose messages should be deleted.")
        .setRequired(true),
    )
    .addIntegerOption((opt) =>
      opt
        .setName("days")
        .setDescription("Delete messages from the last N days (1-14).")
        .setMinValue(1)
        .setMaxValue(14)
        .setRequired(true),
    )
    .addStringOption((opt) =>
      opt
        .setName("scope")
        .setDescription("Where to search for messages.")
        .setRequired(true)
        .addChoices(
          { name: "All text channels", value: "all" },
          { name: "Category only", value: "category" },
        ),
    )
    .addStringOption((opt) =>
      opt
        .setName("reason")
        .setDescription("Reason for deleting this user's messages.")
        .setRequired(true),
    )
    .addChannelOption((opt) =>
      opt
        .setName("category")
        .setDescription("Category to limit the purge to.")
        .addChannelTypes(ChannelType.GuildCategory),
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const targetUser = interaction.options.getUser("user", true);
    const days = interaction.options.getInteger("days", true);
    const scope = interaction.options.getString("scope", true);
    const reason = interaction.options.getString("reason", true);
    const category = interaction.options.getChannel("category");

    if (scope === "category" && !category) {
      return interaction.editReply({
        content: "❌ You must specify a category when scope is **category**.",
      });
    }

    const actionId = generateId();
    let lastProgressUpdate = 0;

    const result = await purgeUserMessages({
      guild: interaction.guild,
      userId: targetUser.id,
      days,
      categoryId: scope === "category" ? category.id : null,
      onProgress: async ({
        channel,
        totalDeleted,
        channelsDone,
        channelsTotal,
      }) => {
        if (channelsDone - lastProgressUpdate < PROGRESS_UPDATE_INTERVAL) {
          return;
        }

        lastProgressUpdate = channelsDone;
        await interaction
          .editReply({
            content: `Scanning <#${channel.id}>… (${channelsDone}/${channelsTotal} channels, ${totalDeleted} messages deleted)`,
          })
          .catch(() => {});
      },
    });

    const scopeLabel =
      scope === "category" ? `Category: ${category.name}` : "All text channels";

    await logModAction({
      interaction,
      userId: targetUser.id,
      userTag: targetUser.tag,
      moderatorTag: interaction.user.tag,
      moderatorId: interaction.user.id,
      action: "purgeuser",
      reason,
      actionId,
      channelTag: scope === "category" ? category.name : "All channels",
      channelId: scope === "category" ? category.id : interaction.guild.id,
      numberOfPurgeMessages: result.deleted,
      purgeDays: days,
      purgeScope: scopeLabel,
      categoryId: scope === "category" ? category.id : "N/A",
    });

    const embed = new EmbedBuilder()
      .setColor(0x2b2d31)
      .setTitle("🧹 User Purge Complete")
      .addFields(
        { name: "User", value: `${targetUser.tag} (<@${targetUser.id}>)` },
        { name: "Time Window", value: `Last ${days} day(s)`, inline: true },
        { name: "Scope", value: scopeLabel, inline: true },
        {
          name: "Deleted Messages",
          value: `${result.deleted}`,
          inline: true,
        },
        {
          name: "Channels Scanned",
          value: `${result.channelsScanned}`,
          inline: true,
        },
        {
          name: "Channels Skipped",
          value: `${result.channelsSkipped}`,
          inline: true,
        },
        {
          name: "Channels Total",
          value: `${result.channelsTotal}`,
          inline: true,
        },
        { name: "Moderator", value: interaction.user.tag, inline: true },
        { name: "Reason", value: reason },
        { name: "Log ID", value: `\`${actionId}\`` },
      )
      .setTimestamp();

    if (result.errors.length > 0) {
      embed.addFields({
        name: "Errors",
        value: result.errors.slice(0, 5).join("\n").slice(0, 1024),
      });
    }

    return interaction.editReply({
      content: null,
      embeds: [embed],
    });
  },
};
