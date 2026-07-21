const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('website')
    .setDescription('Get the Link to the r/Alevel website!'),
  async execute(interaction) {
    await interaction.reply('Heres the r/Alevel website: [A haven for Resources](https://ralevel.com/)')
  },
};    
  