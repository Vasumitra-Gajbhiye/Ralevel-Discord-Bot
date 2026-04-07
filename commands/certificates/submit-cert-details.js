const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} = require("discord.js");
const Certificate = require("../../models/certificate.js");
require("dotenv").config();

module.exports = {
  data: new SlashCommandBuilder()
    .setName("submit-cert-details")
    .setDescription(
      "Record legal name + email for an approved certificate application"
    )
    .addStringOption((opt) =>
      opt
        .setName("applicationid")
        .setDescription("Approved Application ID")
        .setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName("name")
        .setDescription("Legal full name for certificate")
        .setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName("email")
        .setDescription("Email for certificate delivery")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  async execute(interaction) {
    const ADMIN_ROLE_ID = process.env.ADMIN_ROLE_ID;
    const CERT_UPDATES_CHANNEL = process.env.CERT_UPDATES_CHANNEL; // Public certificate updates channel

    if (!interaction.member.roles.cache.has(ADMIN_ROLE_ID)) {
      return interaction.reply({ ephemeral: true, content: "❌ Admins only." });
    }

    await interaction.deferReply({ ephemeral: true });

    const applicationId = interaction.options.getString("applicationid");
    const legalName = interaction.options.getString("name");
    const email = interaction.options.getString("email");

    try {
      const app = await Certificate.findById(applicationId);
      if (!app)
        return interaction.editReply({
          content: "❌ Application not found in DB.",
        });

      if (app.status !== "approved") {
        return interaction.editReply({
          content: "⚠️ That application is not approved yet.",
        });
      }

      if (app.status == "details submitted") {
        return interaction.editReply({
          content: "⚠️ Details already saved for this application.",
        });
      }

      // Save details
      app.legalName = legalName;
      app.email = email;
      app.status = "details submitted";
      app.detailsSubmittedAt = new Date();
      await app.save();

      // DM Applicant
      try {
        const targetUser = await interaction.client.users
          .fetch(app.userId)
          .catch(() => null);
        if (targetUser) {
          await targetUser
            .send({
              embeds: [
                new EmbedBuilder()
                  .setTitle("📜 Certificate Details Recorded")
                  .setDescription(
                    "Your certificate is being prepared. Here are the details we have received:"
                  )
                  .setColor("#00B894")
                  .addFields(
                    { name: "👤 Legal Name", value: legalName, inline: false },
                    { name: "📩 Email", value: email, inline: false },
                    {
                      name: "🆔 Application ID",
                      value: `\`${applicationId}\``,
                      inline: false,
                    },
                    {
                      name: "⚠️ Note",
                      value:
                        "If any information is incorrect, contact staff via email. Changes may not always be possible.",
                      inline: false,
                    }
                  )
                  .setTimestamp(),
              ],
            })
            .catch(() => {});
        }
      } catch (error) {
        // Send update
        try {
          const updatesCh = await interaction.client.channels.fetch(
            CERT_UPDATES_CHANNEL
          );
          const applicantUser = await interaction.client.users.fetch(
            app.userId
          );

          const updateEmbed = new EmbedBuilder()
            .setTitle("📜 Certificate Details Recorded")
            .setDescription(
              "Your certificate is being prepared. Here are the details we have received:"
            )
            .setColor("#00B894")
            .addFields(
              {
                name: "👤 Legal Name",
                value: "Hidden for confidentiality",
                inline: false,
              },
              {
                name: "📩 Email",
                value: "Hidden for confidentiality",
                inline: false,
              },
              {
                name: "🆔 Application ID",
                value: `\`${applicationId}\``,
                inline: false,
              },
              {
                name: "⚠️ Note",
                value:
                  "You're seeing updates here because your DMs are closed or restricted. \n Ping @Admin to check if correct details have been submited.",
                inline: false,
              }
            )
            .setFooter({
              text: "You're seeing updates here because your DMs are closed or restricted.",
            })
            .setTimestamp();

          await updatesCh.send({
            content: `<@${applicantUser.id}>`,
            embeds: [updateEmbed],
          });
        } catch (err) {
          console.error(err);
        }
      }

      // ✅ NEW → Send EMBED in Review Channel
      const reviewCh = await interaction.client.channels
        .fetch("1442441607671451648")
        .catch(() => null);
      if (reviewCh) {
        await reviewCh
          .send({
            embeds: [
              new EmbedBuilder()
                .setTitle("📥 Certificate Details Submitted")
                .setDescription(
                  "A moderator has recorded new certificate details."
                )
                .setColor("#FFC107")
                .addFields(
                  {
                    name: "👤 User",
                    value: `${app.userTag} (${app.userId})`,
                    inline: false,
                  },
                  {
                    name: "📘 Certificate Type",
                    value: app.type,
                    inline: false,
                  },
                  { name: "👤 Legal Name", value: legalName, inline: false },
                  { name: "📩 Email", value: email, inline: false },
                  {
                    name: "🆔 Application ID",
                    value: `\`${applicationId}\``,
                    inline: false,
                  },
                  {
                    name: "🛠️ Recorded By",
                    value: `${interaction.user.tag}`,
                    inline: false,
                  },
                  {
                    name: "⏰ Joined Server",
                    value: app.joinedAt
                      ? `<t:${Math.floor(
                          new Date(app.joinedAt).getTime() / 1000
                        )}:R>`
                      : "Unknown",
                    inline: true,
                  },
                  {
                    name: "⭐ Rep Count",
                    value: `${app.rep ?? 0}`,
                    inline: true,
                  }
                )
                .setTimestamp(),
            ],
          })
          .catch(() => {});
      }

      await interaction.editReply({
        content: "✅ Details saved and user notified.",
      });
    } catch (err) {
      console.error("[submit-cert-details] ERROR:", err);
      return interaction.editReply({
        content: "⚠️ Error while updating certificate details. Check logs.",
      });
    }
  },
};
