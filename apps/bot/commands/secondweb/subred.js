const { SlashCommandBuilder } = require('discord.js');

module.exports = { 
  data: new SlashCommandBuilder()
    .setName('subreddit')
    .setDescription('Get the Link to the r/Alevel subreddit!'),
  async execute(interaction) {
    await interaction.reply('Heres the r/Alevel subreddit: [The largest A Level student community on Reddit](https://www.reddit.com/r/alevel/)')
  },
};
