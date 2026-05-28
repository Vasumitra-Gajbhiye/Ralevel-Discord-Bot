const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const Reputation = require("../../models/reputation.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("my-reputation")
    .setDescription("Display your current reputation publicly."),

  async execute(interaction) {
    const userId = interaction.user.id;

    // Fetch or initialize reputation
    let repRecord = await Reputation.findOne({ userId });
    if (!repRecord) repRecord = await Reputation.create({ userId, rep: 0 });

    const embed = new EmbedBuilder()
      .setTitle("🌟 Reputation Score")
      .setDescription(
        `${interaction.user} currently has **${repRecord.rep} reputation**.`,
      )
      .setColor("#00AEEF")
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  },
};
