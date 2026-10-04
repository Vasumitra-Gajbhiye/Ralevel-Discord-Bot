const { VerbalWarning } = require("@ralevel/db");
const { SlashCommandBuilder } = require("discord.js");
const logModAction = require("../../utils/logModAction");
const generateActionId = require("../../utils/generateId.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("clear-verbal-warnings")
    .setDescription("Clear all verbal warnings for a user")
    .addUserOption((opt) =>
      opt
        .setName("user")
        .setDescription("User whose verbal warnings should be cleared")
        .setRequired(true),
    )
    .addStringOption((opt) =>
      opt
        .setName("reason")
        .setDescription("Reason for clearing the verbal warnings")
        .setRequired(true),
    ),

  async execute(interaction) {
    await interaction.deferReply();
    const user = interaction.options.getUser("user");
    const reason = interaction.options.getString("reason");

    const { modifiedCount } = await VerbalWarning.updateMany(
      { userId: user.id, active: true },
      { $set: { active: false, delReason: reason } },
    );
    if (modifiedCount === 0)
      return interaction.editReply(
        `✅ No verbal warnings found for <@${user.id}>.`,
      );

    await logModAction({
      interaction,
      userId: user.id,
      userTag: user.tag,
      moderatorTag: interaction.user.tag,
      moderatorId: interaction.user.id,
      action: "clear-verbal-warnings",
      reason,
      actionId: generateActionId(),
    });
    return interaction.editReply(
      `🧹 Cleared **${modifiedCount}** verbal warnings for <@${user.id}>.`,
    );
  },
};
