const { VerbalWarning } = require("@ralevel/db");
const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} = require("discord.js");
const fetchModeratorTags = require("../../utils/fetchModeratorTags");
const {
  buildVerbalWarningFields,
  describeVerbalWarningCounts,
} = require("../../utils/warningFields");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("verbal-warnings")
    .setDescription("View all verbal warnings of a user")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addUserOption((opt) =>
      opt
        .setName("user")
        .setDescription("User to check verbal warnings for")
        .setRequired(true),
    ),

  async execute(interaction) {
    const user = interaction.options.getUser("user");

    const logs = await VerbalWarning.find({ userId: user.id, active: true })
      .sort({ timestamp: -1 })
      .lean();

    if (logs.length === 0) {
      return interaction.reply({
        content: `✅ **${user.tag}** has no verbal warnings.`,
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

    const result = buildVerbalWarningFields(
      logs,
      (log) =>
        log.moderatorTag ||
        moderatorTags.get(log.moderatorId) ||
        "Unknown Moderator",
    );

    const embed = new EmbedBuilder()
      .setTitle(`🗣️ Verbal warnings for ${user.tag}`)
      .setDescription(describeVerbalWarningCounts(result))
      .setColor("Yellow")
      .addFields(result.fields);

    return interaction.reply({ embeds: [embed] });
  },
};
