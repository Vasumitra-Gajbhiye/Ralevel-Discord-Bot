const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("privacy-policy")
    .setDescription("Get the r/alevel Bot Privacy Policy"),
  async execute(interaction) {
    await interaction.reply(
      "Heres the r/alevel Bot Privacy Policy: [Privacy Policy](https://ralevel.com/legal/ralevel-bot/privacy-policy)",
    );
  },
};
