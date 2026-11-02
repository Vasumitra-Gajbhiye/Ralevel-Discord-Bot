const { EmbedBuilder } = require("discord.js");
const { applyMessageCountChange } = require("../../utils/xp");

module.exports = {
  // Mounted as /xp-admin set-msg-count by xp-admin.js
  subcommand: (subcommand) => subcommand
    .setName("set-msg-count")
    .setDescription("Set a user's message count to an exact amount.")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("The user to set message count for.")
        .setRequired(true),
    )
    .addIntegerOption((option) =>
      option
        .setName("amount")
        .setDescription("The new message count.")
        .setRequired(true)
        .setMinValue(0),
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const target = interaction.options.getUser("user");
    const amount = interaction.options.getInteger("amount");
    const guildId = interaction.guild.id;

    const { previousCount, newCount } = await applyMessageCountChange({
      guildId,
      userId: target.id,
      newCount: amount,
    });

    const embed = new EmbedBuilder()
      .setTitle("Message Count Set")
      .setDescription(
        `Set ${target}'s message count to **${newCount.toLocaleString()}**.`,
      )
      .addFields({
        name: "Messages",
        value: `${previousCount.toLocaleString()} → ${newCount.toLocaleString()}`,
      })
      .setColor("#5865F2")
      .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
  },
};
