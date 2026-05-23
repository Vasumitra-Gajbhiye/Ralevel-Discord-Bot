//timeout-status-command

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} = require("discord.js");

const ModLog = require("../../models/modlog");
const ms = require("ms");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("timeout-status")
    .setDescription("Shows all currently timed out users with details.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    await interaction.reply({
      content: "⏳ Checking current timeouts...",
      ephemeral: true,
    });

    // 1. Fetch all timeout logs (latest entries)
    const logs = await ModLog.aggregate([
      { $match: { action: "timeout" } },
      {
        $sort: { timestamp: -1 },
      },
      {
        $group: {
          _id: "$userId",
          doc: { $first: "$$ROOT" },
        },
      },
    ]);

    if (!logs.length) {
      const embed = new EmbedBuilder()
        .setColor(0x2b2d31)
        .setTitle("⏳ Timeout Status")
        .setDescription("✅ No users are currently timed out.")
        .setTimestamp();

      return interaction.editReply({ content: "", embeds: [embed] });
    }

    let activeTimeouts = [];

    // 2. Check each user to see if timeout is still active
    for (const entry of logs) {
      const userId = entry._id;
      const lastLog = entry.doc;

      const member = await interaction.guild.members
        .fetch(userId)
        .catch(() => null);
      if (!member) continue;

      if (!member.isCommunicationDisabled()) continue;

      // Parse reason & duration from db
      const reason =
        lastLog.reason.split("Reason:")[1]?.trim() || "No reason logged";
      const durationMatch = lastLog.reason.match(/Duration:\s(.+)/);
      const duration = durationMatch ? durationMatch[1] : "Unknown";

      activeTimeouts.push({
        tag: member.user.tag,
        id: userId,
        end: member.communicationDisabledUntil,
        duration,
        reason,
      });
    }

    // No active timeouts
    if (!activeTimeouts.length) {
      const embed = new EmbedBuilder()
        .setColor(0x2b2d31)
        .setTitle("⏳ Timeout Status")
        .setDescription("✅ No users are currently timed out.")
        .setTimestamp();

      return interaction.editReply({ content: "", embeds: [embed] });
    }

    // Build final output
    let description = "";
    for (const t of activeTimeouts) {
      const remaining = t.end - Date.now();

      description += `**${t.tag}**\n`;
      description += `• **User ID:** ${t.id}\n`;
      description += `• **Duration:** ${t.duration}\n`;
      description += `• **Time Left:** ${ms(remaining, { long: true })}\n`;
      description += `• **Ends:** <t:${Math.floor(t.end / 1000)}:R>\n`;
      description += `• **Reason:** ${t.reason}\n\n`;
    }

    const embed = new EmbedBuilder()
      .setColor(0x2b2d31)
      .setTitle("⏳ Timeout Status")
      .setDescription(description)
      .setTimestamp();

    return interaction.editReply({ content: "", embeds: [embed] });
  },
};
