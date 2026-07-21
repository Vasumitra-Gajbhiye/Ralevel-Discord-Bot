const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} = require("discord.js");
const {
  getReminderHourIst,
  getQotdDiagnostics,
} = require("../../utils/qotdHelpers");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("qotd-status")
    .setDescription("Check QOTD rotation and scheduler status")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const status = await getQotdDiagnostics(interaction.client);
    const wouldSendNow = status.wouldSend === "Would send now";
    const reminderHour = status.reminderHourIst ?? getReminderHourIst();

    const embed = new EmbedBuilder()
      .setColor(wouldSendNow ? 0x57f287 : 0xfee75c)
      .setTitle("QOTD Scheduler Status")
      .addFields(
        {
          name: "IST time",
          value: `${status.dateStr} · ${status.hour}:xx (fires after ${reminderHour} AM)`,
          inline: false,
        },
        {
          name: "Scheduler",
          value: status.wouldSend,
          inline: false,
        },
        {
          name: "Channel",
          value: status.channelId
            ? `${status.channelStatus}\n\`${status.channelId}\``
            : "QOTD_REMINDER_CHANNEL_ID not set",
          inline: false,
        },
        {
          name: "Rotation",
          value: status.rotationFound
            ? [
                `enabled: ${status.enabled ?? "true (default)"}`,
                `mods: ${status.modCount}`,
                `currentIndex: ${status.currentIndex}`,
                `lastReminderDate: ${status.lastReminderDate ?? "null"}`,
              ].join("\n")
            : "No document found in qotdrotations",
          inline: false,
        },
      );

    if (status.current && status.next) {
      embed.addFields({
        name: "Assignment",
        value: `Today: <@${status.current.id}> (${status.current.tag})\nNext: <@${status.next.id}> (${status.next.tag})`,
        inline: false,
      });
    }

    return interaction.editReply({ embeds: [embed] });
  },
};
