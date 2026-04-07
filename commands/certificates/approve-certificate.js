// commands/approve-certificate.js
const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} = require("discord.js");
const Certificate = require("../../models/certificate.js");

const ADMIN_ROLE_ID = process.env.ADMIN_ROLE_ID;
const REVIEW_CHANNEL = process.env.REVIEW_CHANNEL;

const CERT_UPDATES_CHANNEL = process.env.CERT_UPDATES_CHANNEL; // Public certificate updates channel

module.exports = {
  data: new SlashCommandBuilder()
    .setName("approve-certificate")
    .setDescription("Approve a certificate application (admin only)")
    .addStringOption((opt) =>
      opt
        .setName("applicationid")
        .setDescription("The application ID to approve")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  async execute(interaction) {
    // Always ACK quickly
    await interaction.deferReply({ ephemeral: true });

    // Permission check (after deferring)
    if (!interaction.member.roles.cache.has(ADMIN_ROLE_ID)) {
      return interaction.editReply({
        content: "❌ Only admins can use this command.",
      });
    }

    const appId = interaction.options.getString("applicationid");

    let app;
    try {
      app = await Certificate.findById(appId);
      if (!app) {
        return interaction.editReply({
          content: "❌ Application not found in database.",
        });
      }
    } catch (dbErr) {
      console.error("[approve-certificate] DB lookup error:", dbErr);
      return interaction.editReply({
        content: "⚠️ Database lookup failed. Check logs.",
      });
    }

    // Block re-approval
    if (app.status !== "pending") {
      return interaction.editReply({
        content: "⚠️ This application is not pending or already processed.",
      });
    }

    // Approve and save
    try {
      app.status = "approved";
      app.moderatorId = interaction.user.id;
      app.resolvedAt = new Date();
      await app.save();
    } catch (saveErr) {
      console.error("[approve-certificate] DB save error:", saveErr);
      return interaction.editReply({
        content: "⚠️ Failed to approve application. Check logs.",
      });
    }

    // Send approval DM EMBED
    try {
      const applicant = await interaction.client.users.fetch(app.userId);
      await applicant.send({
        embeds: [
          new EmbedBuilder()
            .setTitle("✅ Certificate Application Approved")
            .setDescription(
              `Your application for **${app.type}** certificate has been approved by our Administrative team. 🎉\n\n` +
                `**Next step:** Please send your **legal full name** and **email** to **r.alevelserver@gmail.com**.\n\n` +
                `Your **legal full name** will be used in the certificate and cannot be changed later.\n\n` +
                `Application ID:  \`${app._id}\`\n\n` +
                `⚠️ **Note:** \n\n` +
                `When you send details via email, please mention your Application ID in the email.\n\n` +
                `Your full legal name will remain confidental.\n\n` +
                `Please send us the details from the email on which you'd like to receive the certificate.\n`
            )
            .setColor("#00B894")
            .setTimestamp(),
        ],
      });
    } catch (err) {
      console.log(err);
      // Send update
      try {
        const updatesCh = await interaction.client.channels.fetch(
          CERT_UPDATES_CHANNEL
        );
        const applicantUser = await interaction.client.users.fetch(app.userId);

        const updateEmbed = new EmbedBuilder()
          .setTitle("✅ Certificate Application Approved")
          .setDescription(
            `Your application for **${app.type}** certificate has been approved by our Administrative team. 🎉\n\n` +
              `**Next step:** Please send your **legal full name** and **email** to **r.alevelserver@gmail.com**.\n\n` +
              `Your **legal full name** will be used in the certificate and cannot be changed later.\n\n` +
              `Application ID:  \`${app._id}\`\n\n` +
              `⚠️ **Note:** \n\n` +
              `When you send details via email, please mention your Application ID in the email.\n\n` +
              `Your full legal name will remain confidental.\n\n` +
              `Please send us the details from the email on which you'd like to receive the certificate.\n`
          )
          .setColor("#00B894")
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

    // Post to review channel
    try {
      const reviewCh = await interaction.client.channels
        .fetch(REVIEW_CHANNEL)
        .catch(() => null);
      if (reviewCh) {
        const embed = new EmbedBuilder()
          .setTitle("✅ Certificate Application Approved")
          .setDescription(
            `Application ID: \`${app._id}\`\n
                 Moderator: ${interaction.user.tag}
                `
          )
          .setColor("#00B894")
          .setTimestamp();
        await reviewCh.send({
          embeds: [embed],
        });
      }
    } catch (err) {
      console.log(err);
    }

    await interaction.editReply({ content: `✅ Approved` });

    return;
  },
};
