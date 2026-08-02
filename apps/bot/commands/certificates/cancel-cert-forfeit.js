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
const { clearForfeitSchedule } = require("../../utils/certHelpers");

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
    .setName("cancel-cert-forfeit")
    .setDescription("Cancel a scheduled certificate forfeit")
    .addStringOption((opt) =>
      opt
        .setName("applicationid")
        .setDescription("The application ID with a scheduled forfeit")
        .setRequired(true),
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

    try {
      const app = await Certificate.findById(appId);
      if (!app) {
        return interaction.editReply({
          content: "❌ Application not found.",
        });
      }

      if (!app.forfeitAt) {
        return interaction.editReply({
          content: "⚠️ This application does not have a scheduled forfeit.",
        });
      }

      const previousReason = app.forfeitReason || "";
      clearForfeitSchedule(app);
      await app.save();

      const dmEmbed = new EmbedBuilder()
        .setTitle("Certificate Forfeit Cancelled")
        .setDescription(
          `The planned forfeit on your **${app.type}** certificate request has been **cancelled**. Your application remains **${app.status}**.`,
        )
        .addFields({
          name: "Application ID",
          value: `\`${app._id}\``,
          inline: true,
        })
        .setColor("#00B894")
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
                .setTitle("Certificate Forfeit Cancelled")
                .setDescription(
                  `Scheduled forfeit for \`${app._id}\` (**${app.userTag}**) was cancelled by **${interaction.user.tag}**.`,
                )
                .addFields(
                  ...(previousReason
                    ? [
                        {
                          name: "Previous reason",
                          value: previousReason.slice(0, 1024),
                        },
                      ]
                    : []),
                  {
                    name: "Current status",
                    value: app.status,
                    inline: true,
                  },
                )
                .setColor("#00B894")
                .setTimestamp(),
            ],
          });
        }
      } catch (err) {
        console.error(err);
      }

      return interaction.editReply({
        content: `✅ Cancelled scheduled forfeit for \`${app._id}\`.`,
      });
    } catch (err) {
      console.error("[cancel-cert-forfeit] ERROR:", err);
      return interaction.editReply({
        content: "⚠️ Unexpected error. Check console logs.",
      });
    }
  },
};
