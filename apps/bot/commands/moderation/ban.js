const { DEFAULT_BAN_MESSAGES } = require("@ralevel/db");
const { renderMessageTemplate } = require("@ralevel/shared");
const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} = require("discord.js");
const generateActionId = require("../../utils/generateId.js");
const logModAction = require("../../utils/logModAction");
const { getGuildConfig } = require("../../utils/guildConfigStore");

const DELETE_MESSAGE_SECONDS = {
  "1m": 60,
  "1h": 3600,
  "1d": 86400,
  "7d": 604800,
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban a user from the server")
    .addUserOption((option) =>
      option.setName("user").setDescription("User to ban").setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("Reason for ban")
        .setRequired(true),
    )
    // NEW: Appeal option
    .addBooleanOption((option) =>
      option
        .setName("appealable")
        .setDescription("Is this ban appealable?")
        .setRequired(true),
    )
    // NEW: Message deletion option
    .addStringOption((option) =>
      option
        .setName("deletemsgs")
        .setDescription("Delete past messages from user")
        .addChoices(
          { name: "Past 1 minute", value: "1m" },
          { name: "Past 1 hour", value: "1h" },
          { name: "Past 1 day", value: "1d" },
          { name: "Past 7 days", value: "7d" },
        )
        .setRequired(true),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  async execute(interaction) {
    await interaction.deferReply();

    // Use getUser so users not currently in the guild can still be banned by ID
    const user = interaction.options.getUser("user");
    const reason = interaction.options.getString("reason");
    const appealable = interaction.options.getBoolean("appealable");
    const deleteMsgs = interaction.options.getString("deletemsgs");

    if (!user)
      return interaction.editReply({
        content: "❌ User not found.",
        ephemeral: true,
      });

    const deleteSeconds = DELETE_MESSAGE_SECONDS[deleteMsgs];

    // DM user (may fail for non-members with no mutual servers)
    try {
      const banMessages = {
        ...DEFAULT_BAN_MESSAGES,
        ...getGuildConfig().moderation?.banMessages,
      };
      const template = appealable
        ? banMessages.banAppealable
        : banMessages.banNotAppealable;

      const message = renderMessageTemplate(template, {
        reason,
        serverName: interaction.guild.name,
        userTag: user.tag,
        userId: user.id,
        appealUrl: banMessages.appealUrl,
      });

      await user.send(message);
    } catch {}

    // Ban by user ID — works even if they are not in the server
    try {
      await interaction.guild.members.ban(user.id, {
        reason,
        deleteMessageSeconds: deleteSeconds,
      });
    } catch {
      return interaction.editReply({
        content: "❌ I do not have permission to ban this user.",
        ephemeral: true,
      });
    }

    // Log action (DB + channel)
    const actionId = generateActionId();
    await logModAction({
      interaction,
      userId: user.id,
      userTag: user.tag,
      moderatorTag: interaction.user.tag,
      moderatorId: interaction.user.id,
      action: "ban",
      reason,
      actionId,
      banAppealable: appealable ? "Yes" : "No",
      deletedMessages: deleteMsgs,
    });

    const embed = new EmbedBuilder()
      .setTitle("🔨 User Banned")
      .setColor("#ff0000")
      .addFields(
        { name: "User", value: `${user.tag} (${user.id})` },
        { name: "Moderator", value: interaction.user.tag },
        { name: "Reason", value: reason },
        { name: "Appealable?", value: appealable ? "Yes" : "No" },
        { name: "Deleted Messages", value: deleteMsgs },
        { name: "Action ID", value: actionId },
      )
      .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
  },
};
