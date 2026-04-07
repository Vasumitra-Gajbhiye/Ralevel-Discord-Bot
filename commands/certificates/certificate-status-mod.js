// commands/certificate-status.js
const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} = require("discord.js");
const Certificate = require("../../models/certificate");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("certificate-status-mod")
    .setDescription("View certificate application status")
    .addUserOption((opt) =>
      opt
        .setName("user")
        .setDescription("User to check (mods only)")
        .setRequired(false)
    )
    .addStringOption((opt) =>
      opt
        .setName("application_id")
        .setDescription("Application ID to search")
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  async execute(interaction) {
    const targetUser = interaction.options.getUser("user");
    const applicationId = interaction.options.getString("application_id");

    const modRoles = process.env.MOD_ROLES?.split(",") || [];
    const isMod =
      interaction.member?.roles.cache.some((r) => modRoles.includes(r.id)) ||
      interaction.member?.roles.cache.has(process.env.ADMIN_ROLE_ID);

    // =========================================================
    // 1️⃣ If searching by application ID
    // =========================================================
    if (applicationId) {
      const app = await Certificate.findById(applicationId);

      if (!app) {
        return interaction.reply({
          content: "❌ No application found with that ID.",
          ephemeral: true,
        });
      }

      // Non-mods can only view their own
      if (!isMod && app.userId !== interaction.user.id) {
        return interaction.reply({
          content: "❌ You can only view your own applications.",
          ephemeral: true,
        });
      }

      const embed = new EmbedBuilder()
        .setTitle(`📄 Certificate Application — ${app._id}`)
        .setColor("#5865F2")
        .addFields(
          { name: "User", value: `${app.userTag} (${app.userId})` },
          { name: "Type", value: app.type },
          { name: "Status", value: app.status },
          { name: "Rep at Submission", value: `${app.rep}` },
          {
            name: "Submitted",
            value: `<t:${Math.floor(app.createdAt.getTime() / 1000)}:F>`,
          }
        );

      if (app.resolvedAt) {
        embed.addFields({
          name: "Resolved",
          value: `<t:${Math.floor(app.resolvedAt.getTime() / 1000)}:F>`,
        });
      }

      if (app.detailsSubmittedAt) {
        embed.addFields({
          name: "Details Submitted",
          value: `<t:${Math.floor(app.detailsSubmittedAt.getTime() / 1000)}:F>`,
        });
      }

      if (app.deliveredAt) {
        embed.addFields({
          name: "Delivered at",
          value: `<t:${Math.floor(app.deliveredAt.getTime() / 1000)}:F>`,
        });
      }

      if (app.reason) {
        embed.addFields({
          name: "Moderator Reason",
          value: app.reason.slice(0, 1024),
        });
      }

      // ✅ Always show these two fields
      embed.addFields(
        {
          name: "Legal Name",
          value:
            app.legalName && app.legalName.trim()
              ? app.legalName
              : "Not yet submitted",
        },
        {
          name: "Email",
          value:
            app.email && app.email.trim() ? app.email : "Not yet submitted",
        }
      );

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // =========================================================
    // 2️⃣ If checking another user
    // =========================================================
    if (targetUser) {
      if (!isMod && targetUser.id !== interaction.user.id) {
        return interaction.reply({
          content: "❌ You cannot view another user's certificate status.",
          ephemeral: true,
        });
      }

      // Only show non-rejected applications for this view
      const apps = await Certificate.find({
        userId: targetUser.id,
        status: { $ne: "rejected" },
      }).sort({ createdAt: -1 });

      if (!apps.length) {
        return interaction.reply({
          content: `${targetUser.tag} has no certificate applications.`,
          ephemeral: true,
        });
      }

      const embed = new EmbedBuilder()
        .setTitle(`📄 Certificate Applications — ${targetUser.tag}`)
        .setColor("#5865F2");

      for (const app of apps) {
        embed.addFields({
          name: `${app.type} — ${app.status.toUpperCase()}`,
          value:
            `ID: \`${app._id}\`\n` +
            `Submitted: <t:${Math.floor(app.createdAt.getTime() / 1000)}:F>\n` +
            (app.resolvedAt
              ? `Resolved: <t:${Math.floor(
                  app.resolvedAt.getTime() / 1000
                )}:F>\n`
              : "") +
            `Rep at submission: ${app.rep}\n` +
            (app.reason ? `Reason: ${app.reason}\n` : "") +
            `Legal Name: **${
              app.legalName && app.legalName.trim()
                ? app.legalName
                : "Not yet submitted"
            }**\n` +
            `Email: **${
              app.email && app.email.trim() ? app.email : "Not yet submitted"
            }**\n`,
          inline: false,
        });
      }

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // =========================================================
    // 3️⃣ Global grouped status (mods only)
    // =========================================================
    if (!isMod) {
      return interaction.reply({
        content: "❌ Only moderators can view global application status.",
        flags: 64,
      });
    }

    const approvalPending = await Certificate.find({ status: "pending" }).sort({
      createdAt: -1,
    });
    const approvedAwaitingDetails = await Certificate.find({
      status: "approved",
      detailsSubmittedAt: null,
    }).sort({ createdAt: -1 });
    const approvedAwaitingCreation = await Certificate.find({
      status: "details submitted",
    }).sort({ createdAt: -1 });

    const embed = new EmbedBuilder()
      .setTitle("📊 Certificate Application Status Overview")
      .setColor("#5865F2")
      .addFields(
        {
          name: "🟡 Awaiting Approval",
          value: approvalPending.length
            ? approvalPending
                .map((a) => `• \`${a._id}\` — ${a.userTag}`)
                .join("\n")
            : "None",
          inline: false,
        },
        {
          name: "🟠 Approved — Awaiting Details",
          value: approvedAwaitingDetails.length
            ? approvedAwaitingDetails
                .map((a) => `• \`${a._id}\` — ${a.userTag}`)
                .join("\n")
            : "None",
          inline: false,
        },
        {
          name: "🟢 Details Submited — Awaiting Certificate Creation",
          value: approvedAwaitingCreation.length
            ? approvedAwaitingCreation
                .map((a) => `• \`${a._id}\` — ${a.userTag}`)
                .join("\n")
            : "None",
          inline: false,
        }
      );

    // =========================================================
    // 4️⃣ Delivered certificates section (bottom)
    // =========================================================
    const delivered = await Certificate.find({
      status: "completed and delivered",
      detailsSubmittedAt: { $ne: null },
    })
      .sort({ resolvedAt: -1 })
      .limit(5);

    if (delivered.length) {
      embed.addFields({
        name: "✅ Recently Delivered Certificates",
        value: delivered
          .map((a) => `• \`${a._id}\` — ${a.userTag}\n  ↳ ID: ${a.certId}`)
          .join("\n"),
        inline: false,
      });
    } else {
      embed.addFields({
        name: "✅ Recently Delivered Certificates",
        value: "None",
        inline: false,
      });
    }

    return interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
