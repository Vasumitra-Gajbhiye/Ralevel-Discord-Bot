const { Warning } = require("@ralevel/db");
const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} = require("discord.js");
const fetchModeratorTags = require("../../utils/fetchModeratorTags");
const {
  buildWarningFields,
  describeWarningCounts,
} = require("../../utils/warningFields");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("warnings")
    .setDescription("View all warnings of a user")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addUserOption((opt) =>
      opt
        .setName("user")
        .setDescription("User to check warnings for")
        .setRequired(true),
    ),

  async execute(interaction) {
    const user = interaction.options.getUser("user");

    const logs = await Warning.find({ userId: user.id, active: true })
      .sort({ timestamp: -1 })
      .lean();

    if (logs.length === 0) {
      return interaction.reply({
        content: `✅ **${user.tag}** has no warnings.`,
        ephemeral: true,
      });
    }

    const missingModeratorIds = logs
      .filter((log) => !log.moderatorTag)
      .map((log) => log.moderatorId);

    const moderatorTags = await fetchModeratorTags(
      interaction.client,
      missingModeratorIds,
    );

    const result = buildWarningFields(
      logs,
      (log) =>
        log.moderatorTag ||
        moderatorTags.get(log.moderatorId) ||
        "Unknown Moderator",
    );

    const embed = new EmbedBuilder()
      .setTitle(`⚠️ Warnings for ${user.tag}`)
      .setDescription(describeWarningCounts(result))
      .setColor("Orange")
      .addFields(result.fields);

    return interaction.reply({ embeds: [embed] });
  },
};
