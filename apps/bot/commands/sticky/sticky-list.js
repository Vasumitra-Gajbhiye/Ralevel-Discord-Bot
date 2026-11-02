const { Sticky } = require("@ralevel/db");
const {
  EmbedBuilder,
} = require("discord.js");

module.exports = {
  // Mounted as /sticky list by sticky.js
  subcommand: (subcommand) => subcommand
    .setName("list")
    .setDescription("List all sticky messages in this server"),

  async execute(interaction) {
    const stickies = await Sticky.find({
      guildId: interaction.guildId,
    });

    if (!stickies.length) {
      return interaction.reply({
        content: "ℹ️ No sticky messages found.",
        ephemeral: true,
      });
    }

    const lines = stickies.map(s =>
      `<#${s.channelId}> — ${
        s.enabled ? "✅ Enabled" : "❌ Disabled"
      } • ${s.lineThreshold ?? 8} lines`
    );

    const embed = new EmbedBuilder()
      .setTitle("📌 Active Sticky Messages")
      .setDescription(lines.join("\n"))
      .setColor(0x5865f2);

    await interaction.reply({
      embeds: [embed],
      ephemeral: true,
    });
  },
};