const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} = require("discord.js");
const ModLog = require("../../models/modlog.js");
const Warning = require("../../models/warning.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("warnings")
    .setDescription("View all warnings of a user")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addUserOption((opt) =>
      opt
        .setName("user")
        .setDescription("User to check warnings for")
        .setRequired(true),
    ),

  async execute(interaction) {
    const user = interaction.options.getUser("user");

    // Fetch only WARN entries for that user
    const logs = await Warning.find({ userId: user.id, active: true }).sort({
      timestamp: -1,
    });

    if (logs.length === 0) {
      return interaction.reply({
        content: `✅ **${user.tag}** has no warnings.`,
        ephemeral: true,
      });
    }

    // Build embed
    const embed = new EmbedBuilder()
      .setTitle(`⚠️ Warnings for ${user.tag}`)
      .setColor("Orange");

    for (const log of logs) {
      // Fetch moderator name
      let moderatorName = "Unknown Moderator";
      try {
        const modUser = await interaction.client.users.fetch(log.moderatorId);
        moderatorName = modUser?.tag || log.moderatorId;
      } catch {
        moderatorName = log.moderatorId; // fallback
      }

      embed.addFields({
        name: `🚨 Warning ID: ${log.actionId}`,
        value:
          `**Moderator:** ${moderatorName}\n` +
          `**Reason:** ${log.reason}\n` +
          `**Date:** <t:${Math.floor(log.timestamp / 1000)}:F>`,
        inline: false,
      });
    }

    return interaction.reply({ embeds: [embed] });
  },
};
