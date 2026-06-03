const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const Warning = require("../../models/warning.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("my-warnings")
    .setDescription("View your active warnings"),

  async execute(interaction) {
    const logs = await Warning.find({
      userId: interaction.user.id,
      active: true,
    }).sort({ timestamp: -1 });

    if (logs.length === 0) {
      return interaction.reply({
        content: "✅ You have no active warnings.",
        ephemeral: true,
      });
    }

    const embed = new EmbedBuilder()
      .setTitle("⚠️ Your warnings")
      .setColor("Orange");

    for (const log of logs) {
      embed.addFields({
        name: `🚨 Warning ID: ${log.actionId}`,
        value:
          `**Reason:** ${log.reason}\n` +
          `**Date:** <t:${Math.floor(log.timestamp / 1000)}:F>`,
        inline: false,
      });
    }

    return interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
