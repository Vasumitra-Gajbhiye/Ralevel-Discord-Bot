const { VerbalWarning } = require("@ralevel/db");
const { SlashCommandBuilder } = require("discord.js");
const logModAction = require("../../utils/logModAction");
const generateActionId = require("../../utils/generateId.js");
const checkRoleHierarchy = require("../../utils/checkRoleHierarchy.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("delete-verbal-warning")
    .setDescription("Delete a specific verbal warning by its action ID")
    .addStringOption((opt) =>
      opt
        .setName("actionid")
        .setDescription("Action ID of the verbal warning")
        .setRequired(true),
    )
    .addStringOption((opt) =>
      opt
        .setName("reason")
        .setDescription("Reason for deleting the verbal warning")
        .setRequired(true),
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const actionId = interaction.options.getString("actionid");
    const reason = interaction.options.getString("reason");

    const warning = await VerbalWarning.findOne({ actionId });

    if (!warning)
      return interaction.editReply({
        content: "❌ No verbal warning found with that ID.",
      });

    if (!warning.active)
      return interaction.editReply({
        content: "❌ This verbal warning is already deleted.",
      });

    if (interaction.guild) {
      const targetMember = await interaction.guild.members
        .fetch(warning.userId)
        .catch(() => null);

      const hierarchyError = checkRoleHierarchy(interaction, targetMember);
      if (hierarchyError) {
        return interaction.editReply({ content: hierarchyError.message });
      }
    }

    warning.active = false;
    warning.delReason = reason;
    await warning.save();

    await logModAction({
      interaction,
      userId: warning.userId,
      userTag: warning.userTag,
      moderatorTag: interaction.user.tag,
      moderatorId: interaction.user.id,
      action: "verbal-warning-delete",
      reason: `${warning.reason}`,
      actionId: generateActionId(),

      deletedWarningId: actionId,
      warningDelReason: reason,
    });

    return interaction.editReply(`🗑️ Verbal warning **${actionId}** deleted.`);
  },
};
