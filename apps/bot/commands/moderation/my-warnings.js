const { Warning } = require("@ralevel/db");
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const {
  buildWarningFields,
  describeWarningCounts,
} = require("../../utils/warningFields");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("my-warnings")
    .setDescription("View your warnings"),

  async execute(interaction) {
    const logs = await Warning.find({
      userId: interaction.user.id,
      active: true,
    }).sort({ timestamp: -1 });

    if (logs.length === 0) {
      return interaction.reply({
        content: "✅ You have no warnings.",
        ephemeral: true,
      });
    }

    const result = buildWarningFields(logs);

    const embed = new EmbedBuilder()
      .setTitle("⚠️ Your warnings")
      .setDescription(describeWarningCounts(result))
      .setColor("Orange")
      .addFields(result.fields);

    return interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
