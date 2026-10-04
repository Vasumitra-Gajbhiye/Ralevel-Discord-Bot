const { VerbalWarning } = require("@ralevel/db");
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const {
  buildVerbalWarningFields,
  describeVerbalWarningCounts,
} = require("../../utils/warningFields");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("my-verbal-warnings")
    .setDescription("View your verbal warnings"),

  async execute(interaction) {
    const logs = await VerbalWarning.find({
      userId: interaction.user.id,
      active: true,
    })
      .sort({ timestamp: -1 })
      .lean();

    if (logs.length === 0) {
      return interaction.reply({
        content: "✅ You have no verbal warnings.",
        ephemeral: true,
      });
    }

    const result = buildVerbalWarningFields(logs);

    const embed = new EmbedBuilder()
      .setTitle("🗣️ Your verbal warnings")
      .setDescription(describeVerbalWarningCounts(result))
      .setColor("Yellow")
      .addFields(result.fields);

    return interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
