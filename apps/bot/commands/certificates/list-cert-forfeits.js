const { Certificate } = require("@ralevel/db");
const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} = require("discord.js");
require("../../loadEnv");

const {
  getGuildConfig,
  resolveRoleKeys,
} = require("../../utils/guildConfigStore");
const { formatForfeitDeadlineGmt } = require("../../utils/certHelpers");

function memberHasCertModRole(member) {
  const cfg = getGuildConfig();
  const ids = [
    ...resolveRoleKeys(cfg.certificates?.modRoleKeys || []),
    ...(cfg.certificates?.extraModRoleIds || []),
  ];
  return ids.some((id) => member?.roles?.cache?.has(id));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("list-cert-forfeits")
    .setDescription("List certificate applications with a scheduled forfeit")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  async execute(interaction) {
    if (!memberHasCertModRole(interaction.member)) {
      return interaction.reply({
        content: "❌ Only admins can use this command.",
        ephemeral: true,
      });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const apps = await Certificate.find({ forfeitAt: { $ne: null } })
        .sort({ forfeitAt: 1 })
        .limit(25);

      if (!apps.length) {
        return interaction.editReply({
          content: "✅ No certificate forfeits are currently scheduled.",
        });
      }

      const lines = apps.map((app, i) => {
        const gmt = formatForfeitDeadlineGmt(app.forfeitAt);
        const reason = (app.forfeitReason || "—").slice(0, 80);
        return (
          `**${i + 1}.** \`${app._id}\` — ${app.userTag} (${app.type})\n` +
          `Status: \`${app.status}\` · Days: ${app.forfeitDays ?? "—"}\n` +
          `Deadline: **${gmt}**\n` +
          `Reason: ${reason}`
        );
      });

      const embed = new EmbedBuilder()
        .setTitle("Scheduled Certificate Forfeits")
        .setDescription(lines.join("\n\n").slice(0, 4096))
        .setColor("#F39C12")
        .setFooter({
          text: apps.length === 25
            ? "Showing first 25 — soonest first"
            : `${apps.length} scheduled — soonest first`,
        })
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error("[list-cert-forfeits] ERROR:", err);
      return interaction.editReply({
        content: "⚠️ Unexpected error. Check console logs.",
      });
    }
  },
};
