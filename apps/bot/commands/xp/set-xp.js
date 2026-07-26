const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const { applyXpChange } = require("../../utils/xp");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("set-xp")
    .setDescription("Set a user's XP to an exact amount.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("The user to set XP for.")
        .setRequired(true),
    )
    .addIntegerOption((option) =>
      option
        .setName("amount")
        .setDescription("The new XP amount.")
        .setRequired(true)
        .setMinValue(0),
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const target = interaction.options.getUser("user");
    const amount = interaction.options.getInteger("amount");
    const guildId = interaction.guild.id;

    const { previousXp, newXp } = await applyXpChange(interaction.client, {
      guildId,
      userId: target.id,
      newXp: amount,
    });

    const embed = new EmbedBuilder()
      .setTitle("XP Set")
      .setDescription(`Set ${target}'s XP to **${newXp.toLocaleString()}**.`)
      .addFields({
        name: "XP",
        value: `${previousXp.toLocaleString()} → ${newXp.toLocaleString()}`,
      })
      .setColor("#5865F2")
      .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
  },
};
