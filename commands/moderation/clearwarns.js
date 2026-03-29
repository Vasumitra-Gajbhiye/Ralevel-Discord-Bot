const { SlashCommandBuilder } = require("discord.js");
const ModLog = require("../../models/modlog.js");
const logModAction = require("../../utils/logModAction");
const generateActionId = require("../../utils/generateId.js");
const warning = require("../../models/warning.js");

function isModerator(member) {
  const allowedRoles = process.env.MOD_ROLES.split(",");
  return member.roles.cache.some((role) => allowedRoles.includes(role.id));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("clearwarns")
    .setDescription("Clear all warnings for a user")
    .addUserOption((opt) =>
      opt
        .setName("user")
        .setDescription("User whose warnings should be cleared")
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

    const user = interaction.options.getUser("user");

    const reason = interaction.options.getString("reason");
    const actionId = generateActionId();
    const results = await warning.find({ userId: user.id, active: true });
    if (results.length === 0)
      return interaction.editReply(`✅ No warnings found for <@${user.id}>.`);
    console.log(results);

    results.forEach((result) => {
      result.active = false;
      result.save();
      return;
    });

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
      `🧹 Cleared **${results.length}** warnings for <@${user.id}>.`
    );
  },
};
