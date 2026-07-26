const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const { getOrCreateUser, applyXpChange } = require("../../utils/xp");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("subtract-xp")
    .setDescription("Subtract XP from a user.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("The user to remove XP from.")
        .setRequired(true),
    )
    .addIntegerOption((option) =>
      option
        .setName("amount")
        .setDescription("Amount of XP to subtract.")
        .setRequired(true)
        .setMinValue(1),
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const target = interaction.options.getUser("user");
    const amount = interaction.options.getInteger("amount");
    const guildId = interaction.guild.id;

    const user = await getOrCreateUser(guildId, target.id);
    const { previousXp, newXp } = await applyXpChange(interaction.client, {
      guildId,
      userId: target.id,
      newXp: (user.xp ?? 0) - amount,
    });

    const embed = new EmbedBuilder()
      .setTitle("XP Subtracted")
      .setDescription(
        `Removed **${amount.toLocaleString()}** XP from ${target}.`,
      )
      .addFields({
        name: "XP",
        value: `${previousXp.toLocaleString()} → ${newXp.toLocaleString()}`,
      })
      .setColor("#ED4245")
      .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
  },
};
