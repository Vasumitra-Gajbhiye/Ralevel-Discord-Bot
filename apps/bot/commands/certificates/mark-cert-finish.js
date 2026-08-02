const { Certificate } = require("@ralevel/db");
const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} = require("discord.js");
require("../../loadEnv");

const {
  getGuildConfig,
  getChannelId,
  resolveRoleKeys,
} = require("../../utils/guildConfigStore");
const {
  FORFEIT_ELIGIBLE_STATUSES,
  computeForfeitAt,
  formatForfeitDeadlineGmt,
  getCertificatesForfeitHourIst,
} = require("../../utils/certHelpers");

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
    .setName("mark-cert-finish")
    .setDescription(
      "Warn an applicant that their certificate will be forfeited after a grace period",
    )
    .addStringOption((opt) =>
      opt
        .setName("applicationid")
        .setDescription("The application ID to schedule for forfeit")
        .setRequired(true),
    )
    .addStringOption((opt) =>
      opt
        .setName("reason")
        .setDescription("Why the certificate is being forfeited")
        .setRequired(true),
    )
    .addStringOption((opt) =>
      opt
        .setName("action")
        .setDescription(
          "Optional ask — e.g. submit evidence or name/email within the grace period",
        )
        .setRequired(false),
    )
    .addIntegerOption((opt) =>
      opt
        .setName("days")
        .setDescription("Days until forfeit (default 3)")
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(30),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  async execute(interaction) {
    if (!memberHasCertModRole(interaction.member)) {
      return interaction.reply({
        content: "❌ Only admins can use this command.",
        ephemeral: true,
      });
    }

    await interaction.deferReply({ ephemeral: true });

    const appId = interaction.options.getString("applicationid");
    const reason = interaction.options.getString("reason");
    const action = interaction.options.getString("action");
    const days = interaction.options.getInteger("days") ?? 3;

    try {
      const app = await Certificate.findById(appId);
      if (!app) {
        return interaction.editReply({
          content: "❌ Application not found.",
        });
      }

      if (!FORFEIT_ELIGIBLE_STATUSES.includes(app.status)) {
        return interaction.editReply({
          content:
            "⚠️ Forfeit can only be scheduled for applications that are `approved` or `details submitted`.",
        });
      }

      const forfeitAt = computeForfeitAt(days, getCertificatesForfeitHourIst());
      const gmtDeadline = formatForfeitDeadlineGmt(forfeitAt);
      const wasReschedule = Boolean(app.forfeitAt);

      app.forfeitAt = forfeitAt;
      app.forfeitReason = reason;
      app.forfeitAction = action || "";
      app.forfeitScheduledAt = new Date();
      app.forfeitModeratorId = interaction.user.id;
      app.forfeitDays = days;
      await app.save();

      const fields = [
        { name: "Reason", value: reason.slice(0, 1024) },
        {
          name: "Forfeits on",
          value: gmtDeadline,
          inline: true,
        },
        {
          name: "Application ID",
          value: `\`${app._id}\``,
          inline: true,
        },
      ];
      if (action) {
        fields.splice(1, 0, {
          name: "What you need to do",
          value: action.slice(0, 1024),
        });
      }

      const dmEmbed = new EmbedBuilder()
        .setTitle("⚠️ Certificate Request — Forfeit Warning")
        .setDescription(
          `Your application for **${app.type}** is scheduled to be **forfeited** if no further action is taken.`,
        )
        .addFields(fields)
        .setColor("#F39C12")
        .setTimestamp();

      try {
        const u = await interaction.client.users.fetch(app.userId);
        await u.send({ embeds: [dmEmbed] });
      } catch {
        try {
          const updatesCh = await interaction.client.channels.fetch(
            getChannelId("certUpdates"),
          );
          const updateEmbed = EmbedBuilder.from(dmEmbed).setFooter({
            text: "You're seeing updates here because your DMs are closed or restricted.",
          });
          await updatesCh.send({
            content: `<@${app.userId}>`,
            embeds: [updateEmbed],
          });
        } catch (err) {
          console.error(err);
        }
      }

      try {
        const reviewCh = await interaction.client.channels
          .fetch(getChannelId("review"))
          .catch(() => null);
        if (reviewCh) {
          await reviewCh.send({
            embeds: [
              new EmbedBuilder()
                .setTitle("⚠️ Certificate Forfeit Scheduled")
                .setDescription(
                  `Application \`${app._id}\` by **${app.userTag}** ` +
                    `${wasReschedule ? "re-scheduled" : "scheduled"} for forfeit by **${interaction.user.tag}**.`,
                )
                .addFields(
                  { name: "Reason", value: reason.slice(0, 1024) },
                  ...(action
                    ? [
                        {
                          name: "Action asked",
                          value: action.slice(0, 1024),
                        },
                      ]
                    : []),
                  {
                    name: "Deadline (GMT)",
                    value: gmtDeadline,
                    inline: true,
                  },
                  {
                    name: "Days",
                    value: String(days),
                    inline: true,
                  },
                  {
                    name: "Current status",
                    value: app.status,
                    inline: true,
                  },
                )
                .setColor("#F39C12")
                .setTimestamp(),
            ],
          });
        }
      } catch (err) {
        console.error(err);
      }

      return interaction.editReply({
        content:
          `✅ Forfeit ${wasReschedule ? "updated" : "scheduled"} for \`${app._id}\`.\n` +
          `Deadline: **${gmtDeadline}** (${days} day${days === 1 ? "" : "s"}).`,
      });
    } catch (err) {
      console.error("[mark-cert-finish] ERROR:", err);
      return interaction.editReply({
        content: "⚠️ Unexpected error. Check console logs.",
      });
    }
  },
};
