const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} = require("discord.js");
const generateActionId = require("../../utils/generateId.js");
const logModAction = require("../../utils/logModAction");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ban-appeal-rejected")
    .setDescription("Reject a user's ban appeal and notify them")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("User whose appeal was rejected")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("Reason for rejection to send to the user")
        .setRequired(true),
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

    const user = interaction.options.getUser("user");
    const reason = interaction.options.getString("reason");

    if (!user) {
      return interaction.editReply({
        content: "❌ User not found.",
        ephemeral: true,
      });
    }

    let dmSuccess = true;

    // 1. Attempt to DM the user
    try {
      await user.send(
        `❌ **Your ban appeal for the r/Alevel Discord server has been REJECTED.**\n\n` +
          `Your ban will remain in place. \n` +
          `**Reason:** ${reason}`,
      );
    } catch {
      dmSuccess = false;
    }

    // 2. Log action (DB + channel)
    const actionId = generateActionId();
    await logModAction({
      interaction,
      userId: user.id,
      userTag: user.tag,
      moderatorTag: interaction.user.tag,
      moderatorId: interaction.user.id,
      action: "appeal_rejected", // Ensure your logModAction utility can handle this action type
      reason: reason,
      actionId,
    });

    // 3. Respond to moderator
    const embed = new EmbedBuilder()
      .setTitle("❌ Ban Appeal Rejected")
      .setColor("#ff0000")
      .addFields(
        { name: "User", value: `${user.tag} (${user.id})` },
        { name: "Moderator", value: interaction.user.tag },
        { name: "Reason Sent to User", value: reason },
        {
          name: "DM Status",
          value: dmSuccess
            ? "🟢 Delivered"
            : "🔴 Failed (DMs closed or no mutual servers)",
        },
        { name: "Action ID", value: actionId },
      )
      .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
  },
};
