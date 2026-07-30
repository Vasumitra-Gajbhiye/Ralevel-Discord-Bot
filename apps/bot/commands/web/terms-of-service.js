const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("terms-of-service")
    .setDescription("Get the r/alevel Bot Terms of Service"),
  async execute(interaction) {
    await interaction.reply(
      "Heres the r/alevel Bot Terms of Service: [Terms of Service](https://ralevel.com/legal/ralevel-bot/terms-of-service)",
    );
  },
};
