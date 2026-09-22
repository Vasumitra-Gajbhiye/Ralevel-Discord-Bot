const { ModLog, Warning: warning } = require("@ralevel/db");
const { SlashCommandBuilder } = require("discord.js");
const logModAction = require("../../utils/logModAction");
const generateActionId = require("../../utils/generateId.js");
const modPoints = require("../../utils/modPoints");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("clear-warnings")
    .setDescription("Clear all warnings for a user")
    .addUserOption((opt) =>
      opt
        .setName("user")
        .setDescription("User whose warnings should be cleared")
        .setRequired(true),
    )
    .addStringOption((opt) =>
      opt
        .setName("reason")
        .setDescription("Reason for warning")
        .setRequired(true),
    ),

  async execute(interaction) {
    await interaction.deferReply();
    const user = interaction.options.getUser("user");

    const reason = interaction.options.getString("reason");
    const actionId = generateActionId();
    const results = await warning.find({ userId: user.id, active: true });
    if (results.length === 0)
      return interaction.editReply(`✅ No warnings found for <@${user.id}>.`);

    const warningIds = results.map((result) => result.actionId);
    await warning.updateMany(
      { actionId: { $in: warningIds } },
      { $set: { active: false } },
    );
    await modPoints.voidPoints(
      { source: "warn", sourceActionId: { $in: warningIds } },
      { reason: `Warnings cleared: ${reason}`, voidedBy: interaction.user.id },
    );

    await logModAction({
      interaction,
      userId: user.id,
      userTag: user.tag,
      moderatorTag: interaction.user.tag,
      moderatorId: interaction.user.id,
      action: "clearwarns",
      reason,
      actionId,
    });
    return interaction.editReply(
      `🧹 Cleared **${results.length}** warnings for <@${user.id}>.`,
    );
  },
};
