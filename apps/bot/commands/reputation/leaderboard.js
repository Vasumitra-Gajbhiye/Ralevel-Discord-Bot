const { Reputation } = require("@ralevel/db");
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("View the top reputation holders."),

  async execute(interaction) {
    const top = await Reputation.find().sort({ rep: -1 }).limit(10);

    if (top.length === 0) {
      return interaction.reply("Nobody has reputation yet.");
    }

    let description = top
      .map((user, index) => `**#${index + 1}** <@${user.userId}> — **${user.rep} rep**`)
      .join("\n");

    const embed = new EmbedBuilder()
      .setTitle("🏆 Reputation Leaderboard")
      .setDescription(description)
      .setColor("#FFD700")
      .setThumbnail(interaction.guild.iconURL({ dynamic: true }))
      .setTimestamp()
      .setFooter({ text: "Keep helping and earning reputation ✨" });

    return interaction.reply({ embeds: [embed] });
  },
};