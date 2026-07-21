const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("apply")
    .setDescription("Get the r/alevel application form"),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor(0x5865f2) // Discord blurple
      .setTitle("Apply to r/alevel")
      .setDescription(
        "Want to contribute to the **r/alevel community**?\n\n" +
          "Fill out the application form below:\n\n" +
          "🔗 **https://ralevel.com/forms**"
      )
      .setFooter({ text: "r/alevel Community" })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
