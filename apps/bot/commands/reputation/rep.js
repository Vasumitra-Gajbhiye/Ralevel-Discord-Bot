const { Reputation } = require("@ralevel/db");
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("rep")
    .setDescription("Check the reputation of another user.")
    .addUserOption(option =>
      option.setName("user")
        .setDescription("The user whose reputation you want to check.")
        .setRequired(true)
    ),

  async execute(interaction) {
    const target = interaction.options.getUser("user");

    let repRecord = await Reputation.findOne({ userId: target.id });
    if (!repRecord) repRecord = await Reputation.create({ userId: target.id, rep: 0 });

    const embed = new EmbedBuilder()
      .setTitle(`🌟 Reputation of ${target.username}`)
      .setDescription(`${target} has **${repRecord.rep} reputation**.`)
      .setColor("#FFD700")
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  }
};