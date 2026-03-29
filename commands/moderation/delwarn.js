const { SlashCommandBuilder } = require("discord.js");
const ModLog = require("../../models/modlog.js");
const logModAction = require("../../utils/logModAction");
const generateActionId = require("../../utils/generateId.js");
const Warning = require("../../models/warning");

function isModerator(member) {
  const allowedRoles = process.env.MOD_ROLES.split(",");
  return member.roles.cache.some((role) => allowedRoles.includes(role.id));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("delwarn")
    .setDescription("Delete a specific warning by its action ID")
    .addStringOption((opt) =>
      opt
        .setName("actionid")
        .setDescription("Action ID of the warning")
        .setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName("reason")
        .setDescription("Reason for warning")
        .setRequired(true)
    ),

  async execute(interaction) {
    await interaction.deferReply();

    if (!isModerator(interaction.member))
      return interaction.editReply({
        content: "❌ No permission.",
        ephemeral: true,
      });

    const actionId = interaction.options.getString("actionid");
    const reason = interaction.options.getString("reason");

    const warning = await Warning.findOne({ actionId });

    if (!warning)
      return interaction.editReply({
        content: "❌ No warning found with that ID.",
      });

    if (!warning.active)
      return interaction.editReply({
        content: "❌ This warning is already deleted.",
      });

    warning.active = false;
    warning.delReason = reason;
    await warning.save();

    const newActionId = generateActionId();

    await logModAction({
      interaction,
      userId: warning.userId,
      userTag: warning.userTag,
      moderatorTag: interaction.user.tag,
      moderatorId: interaction.user.id,
      action: "warning-delete",
      // target: { id: warning.userId, tag: warning.userId },
      reason: `${warning.reason}`,
      actionId: newActionId,

      deletedWarningId: actionId,
      warningDelReason: reason,
    });

    return interaction.editReply(`🗑️ Warning **${actionId}** deleted.`);
  },
};
