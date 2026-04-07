const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} = require("discord.js");
const ModLog = require("../../models/modlog.js");
const generateActionId = require("../../utils/generateId.js");
const logModAction = require("../../utils/logModAction");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban a user from the server")
    .addUserOption((option) =>
      option.setName("user").setDescription("User to ban").setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("Reason for ban")
        .setRequired(true)
    )
    // NEW: Appeal option
    .addBooleanOption((option) =>
      option
        .setName("appealable")
        .setDescription("Is this ban appealable?")
        .setRequired(true)
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
          { name: "Past 1 month", value: "30d" },
          { name: "All messages", value: "all" }
        )
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  async execute(interaction) {
    await interaction.deferReply();

    const modRoles = [
      ...process.env.MOD_ROLES.split(","),
      "1114477061390733314",
    ];
    if (!interaction.member.roles.cache.some((r) => modRoles.includes(r.id))) {
      return interaction.editReply({
        content: "❌ You cannot use this command.",
        ephemeral: true,
      });
    }

    const member = interaction.options.getMember("user");
    const reason = interaction.options.getString("reason");
    const appealable = interaction.options.getBoolean("appealable");
    const deleteMsgs = interaction.options.getString("deletemsgs");

    if (!member)
      return interaction.editReply({
        content: "❌ User not found.",
        ephemeral: true,
      });

    // Prevent mods banning other mods
    if (
      member.roles.highest.position >= interaction.member.roles.highest.position
    )
      return interaction.editReply({
        content: "❌ You cannot ban this user.",
        ephemeral: true,
      });

    // Convert delete window → seconds (Discord ban option)
    const deleteSeconds = {
      "1m": 60,
      "1h": 3600,
      "1d": 86400,
      "7d": 604800,
      "30d": 2592000,
      all: 0,
    }[deleteMsgs];

    // DM user
    try {
      const appealText = appealable
        ? "You may appeal this ban using the appeal form: https://formcord.app/alevel/ralevel-Appeals-Form"
        : "This ban is **not appealable**.";

      await member.send(
        `🚫 You have been **banned** from **r/Alevel** Discord server.\n` +
          `Reason: ${reason}\n\n${appealText}`
      );
    } catch {}

    // Ban the user
    try {
      await member.ban({
        reason,
        deleteMessageSeconds: deleteSeconds > 604800 ? 604800 : deleteSeconds, // Discord max 7 days
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
      userId: member.user.id,
      userTag: member.user.tag,
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
        { name: "User", value: `${member.user.tag} (${member.id})` },
        { name: "Moderator", value: interaction.user.tag },
        { name: "Reason", value: reason },
        { name: "Appealable?", value: appealable ? "Yes" : "No" },
        { name: "Deleted Messages", value: deleteMsgs },
        { name: "Action ID", value: actionId }
      )
      .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
  },
};
