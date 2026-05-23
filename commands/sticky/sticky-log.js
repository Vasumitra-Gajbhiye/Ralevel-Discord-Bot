const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} = require("discord.js");

const StickyLog = require("../../models/stickyLog");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("sticky-log")
    .setDescription("View recent sticky moderation actions")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageMessages
    ),

  async execute(interaction) {
    const logs = await StickyLog.find({
      guildId: interaction.guildId,
    })
      .sort({ createdAt: -1 })
      .limit(10);

    if (!logs.length) {
      return interaction.reply({
        content: "ℹ️ No sticky actions logged yet.",
        ephemeral: true,
      });
    }

    const lines = logs.map(log => {
      const time = `<t:${Math.floor(
        log.createdAt.getTime() / 1000
      )}:R>`;
      const parts = [
        `**${log.action}** in <#${log.channelId}>`,
        `• Mod: ${log.moderatorTag}`,
      ];

      if (log.content) {
        parts.push(`• Content: ${log.content}`);
      }

      if (log.lineThreshold != null) {
        parts.push(`• Threshold: ${log.lineThreshold} lines`);
      }

      parts.push(`• ${time}`);

      return parts.join("\n");
    });

    const embed = new EmbedBuilder()
      .setTitle("📌 Sticky Log (Last 10 actions)")
      .setDescription(lines.join("\n\n"))
      .setColor(0x00ffff);

    await interaction.reply({
      embeds: [embed],
      ephemeral: true,
    });
  },
};