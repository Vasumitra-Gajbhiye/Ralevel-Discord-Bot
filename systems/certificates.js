// systems/certificates.js
const {
  Events,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  InteractionType,
  ComponentType,
} = require("discord.js");

const Certificate = require("../models/certificate.js");
const Reputation = require("../models/reputation.js");
require("dotenv").config();

// CONFIG — change IDs if needed
const APPLICATION_CHANNEL = process.env.APPLICATION_CHANNEL;
const REVIEW_CHANNEL = process.env.REVIEW_CHANNEL;
const ROLE_SR_HELPER = process.env.ROLE_SR_HELPER; // senior helper role (eligibility)
const ADMIN_ROLE_ID = process.env.ADMIN_ROLE_ID; // only this role can approve/reject / use submit command
const RESOURCE_CONTRIBUTOR_ROLE = process.env.RESOURCE_CONTRIBUTOR_ROLE; // optional role to give on resource approval
const CERT_UPDATES_CHANNEL = process.env.CERT_UPDATES_CHANNEL; // Public certificate updates channel

module.exports = function certificateSystem(client) {
  // Utility: get rep count
  async function getRepCount(userId) {
    try {
      const doc = await Reputation.findOne({ userId });
      return doc?.rep ?? 0;
    } catch {
      return 0;
    }
  }

  // Single InteractionCreate handler for all certificate interactions
  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      // ---------------------------
      // Modal submit flows (reject modal)
      // ---------------------------
      if (interaction.type === InteractionType.ModalSubmit) {
        const customId = interaction.customId || "";
        // Reject modal: cert_reject_modal:<appId>
        if (customId.startsWith("cert_reject_modal:")) {
          const appId = customId.split(":")[1];
          if (!appId) return;

          // Only admins should be able (we'll double-check interaction.member roles)
          const member = interaction.member;
          if (!member || !member.roles.cache.has(ADMIN_ROLE_ID)) {
            return interaction.reply({
              ephemeral: true,
              content: "❌ Only admins may reject applications.",
            });
          }

          // Fetch app
          const app = await Certificate.findById(appId);
          if (!app) {
            return interaction.reply({
              ephemeral: true,
              content: "❌ Application not found.",
            });
          }

          // Collect reason
          const reason =
            interaction.fields.getTextInputValue("reject_reason") ||
            "No reason provided";

          // Update DB
          if (app.status !== "pending") {
            return interaction.reply({
              ephemeral: true,
              content: "⚠️ This application was already processed.",
            });
          }

          app.status = "rejected";
          app.reason = reason;
          app.moderatorId = interaction.user.id;
          app.resolvedAt = new Date();
          await app.save();
          await interaction.deferReply({ ephemeral: true });

          // DM applicant (best-effort)
          try {
            const user = await client.users.fetch(app.userId).catch(() => null);
            if (user) {
              await user
                .send({
                  embeds: [
                    new EmbedBuilder()
                      .setTitle("❌ Certificate Application — Rejected")
                      .setDescription(
                        `Your application for **${app.type}** certificate was rejected.`
                      )
                      .addFields(
                        { name: "Reason", value: reason.slice(0, 1024) },
                        {
                          name: "Application ID",
                          value: `\`${app._id}\``,
                          inline: true,
                        }
                      )
                      .setColor("#ff4d4d")
                      .setTimestamp(),
                  ],
                })
                .catch(() => {});
            }
          } catch {
            // Send update
            try {
              const updatesCh = await client.channels.fetch(
                CERT_UPDATES_CHANNEL
              );
              const applicantUser = await client.users.fetch(app.userId);

              const updateEmbed = new EmbedBuilder()
                .setTitle("❌ Certificate Application — Rejected")
                .setDescription(
                  `Your application for **${app.type}** certificate was rejected.`
                )
                .addFields(
                  { name: "Reason", value: reason.slice(0, 1024) },
                  {
                    name: "Application ID",
                    value: `\`${app._id}\``,
                    inline: true,
                  }
                )
                .setColor("#ff4d4d")
                .setFooter({
                  text: "You're seeing updates here because your DMs are closed or restricted.",
                })
                .setTimestamp();

              await updatesCh.send({
                content: `<@${applicantUser.id}>`, // 👈 ping the user
                embeds: [updateEmbed],
              });
            } catch (err) {
              console.error(err);
            }
          }

          // Post to review channel
          await interaction.editReply({ content: `✅ Rejected` });

          try {
            const reviewCh = await client.channels
              .fetch(REVIEW_CHANNEL)
              .catch(() => null);
            if (reviewCh) {
              const embed = new EmbedBuilder()
                .setTitle("✅ Certificate Application Rejected")
                .setDescription(
                  `Application ID: \`${app._id}\`\n
                 Moderator: ${interaction.user.tag} \n
                 Reason: ${reason}
                `
                )
                .setColor("#ff4d4d")
                .setTimestamp();
              await reviewCh.send({
                embeds: [embed],
              });
            }
          } catch (err) {
            console.log(err);
          }

          return;
        }

        // Details modal by user is NOT used in this version (we use /submit-cert-details or email workflow)
        return;
      }

      // For buttons and other interaction types:
      if (!interaction.isButton()) return;

      const customId = interaction.customId;
      const user = interaction.user;
      const guild = interaction.guild;
      const channel = interaction.channel;

      // ---------------------------
      // APPLY buttons
      // ---------------------------
      if (
        customId === "apply_helper" ||
        customId === "apply_writer" ||
        customId === "apply_resource" ||
        customId === "apply_graphic"
      ) {
        // We will defer reply (ephemeral) because we do DB work
        await interaction.deferReply({ ephemeral: true });

        // Type map
        const type =
          customId === "apply_helper"
            ? "Helper"
            : customId === "apply_writer"
            ? "Writer"
            : customId === "apply_graphic"
            ? "Graphic Designer"
            : "Resource Contributor";

        // If in guild, fetch member for role checks
        let member = null;
        if (guild)
          member = await guild.members.fetch(user.id).catch(() => null);

        // Eligibility: Helper requires senior helper
        if (type === "Helper") {
          if (!member || !member.roles.cache.has(ROLE_SR_HELPER)) {
            return interaction.editReply({
              content:
                "❌ You are not eligible for the Helper Certificate. Only Senior Helpers may apply.\n" +
                "You need 100 Reputation points and 1 month of activity to become Senior Helper\n" +
                "If you think this is an error, contact staff by opening a ticket.",
            });
          }
        }

        // Disallow duplicate pending application of same type
        const already = await Certificate.findOne({
          userId: user.id,
          type,
          status: "pending",
        });
        if (already) {
          return interaction.editReply({
            content: `⚠️ You already have a pending ${type} application (ID: \`${already._id}\`).`,
          });
        }

        // gather info
        const rep = await getRepCount(user.id);
        const joinedAt = member?.joinedAt ?? null;

        // create application
        const app = await Certificate.create({
          userId: user.id,
          userTag: user.tag,
          type,
          rep,
          joinedAt,
          status: "pending",
          createdAt: new Date(),
        });

        // prepare review embed
        const appEmbed = new EmbedBuilder()
          .setTitle("📨 New Certificate Application")
          .setColor("#5865F2")
          .addFields(
            {
              name: "Applicant",
              value: `${user.tag} (${user.id})`,
              inline: true,
            },
            { name: "Type", value: `${type}`, inline: true },
            { name: "Rep", value: `${rep}`, inline: true },
            {
              name: "Joined",
              value: joinedAt
                ? `<t:${Math.floor(joinedAt.getTime() / 1000)}:R>`
                : "Unknown",
              inline: true,
            },
            {
              name: "Submitted",
              value: `<t:${Math.floor(app.createdAt.getTime() / 1000)}:F>`,
              inline: true,
            },
            { name: "Application ID", value: `\`${app._id}\``, inline: false }
          )
          .setFooter({
            text: channel
              ? `Submitted in #${channel.name}`
              : "Submitted (unknown channel)",
          });

        const approveId = `cert_approve:${app._id}`;
        const rejectId = `cert_reject:${app._id}`;

        const reviewRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(approveId)
            .setLabel("Approve")
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(rejectId)
            .setLabel("Reject")
            .setStyle(ButtonStyle.Danger)
        );

        // send to review channel
        const reviewCh = await client.channels
          .fetch(REVIEW_CHANNEL)
          .catch(() => null);
        if (reviewCh) {
          await reviewCh
            .send({ embeds: [appEmbed], components: [reviewRow] })
            .catch(() => {
              // swallow
            });
        }

        // DM applicant (best-effort)
        try {
          const u = await client.users.fetch(user.id);
          if (u) {
            await u
              .send({
                embeds: [
                  new EmbedBuilder()
                    .setTitle("✅ Application Submitted")
                    .setDescription(
                      `Your application for **${type}** certificate was submitted and queued for review.`
                    )
                    .addFields(
                      {
                        name: "Application ID",
                        value: `\`${app._id}\``,
                        inline: false,
                      },
                      { name: "Rep", value: `${rep}`, inline: true },
                      {
                        name: "Joined",
                        value: joinedAt
                          ? `<t:${Math.floor(joinedAt.getTime() / 1000)}:R>`
                          : "Unknown",
                        inline: true,
                      }
                    )
                    .setColor("#00B894"),
                ],
              })
              .catch(() => {});
          }
        } catch {
          // Send update
          try {
            const updatesCh = await client.channels.fetch(CERT_UPDATES_CHANNEL);
            const applicantUser = await client.users.fetch(user.id);

            const updateEmbed = new EmbedBuilder()
              .setTitle("✅ Application Submitted")
              .setDescription(
                `Your application for **${type}** certificate was submitted and queued for review.`
              )
              .addFields(
                {
                  name: "Application ID",
                  value: ` \`${app._id}\``,
                  inline: false,
                },
                { name: "Rep", value: `${rep}`, inline: true },
                {
                  name: "Joined",
                  value: joinedAt
                    ? `<t:${Math.floor(joinedAt.getTime() / 1000)}:R>`
                    : "Unknown",
                  inline: true,
                }
              )
              .setColor("#00B894")
              .setFooter({
                text: "You're seeing updates here because your DMs are closed or restricted.",
              })
              .setTimestamp();

            await updatesCh.send({
              content: `<@${applicantUser.id}>`, // 👈 ping the user
              embeds: [updateEmbed],
            });
          } catch (err) {
            console.error(err);
          }
        }

        return interaction.editReply({
          content: `✅ Your ${type} application has been submitted (ID: \`${app._id})\`.`,
        });
      }

      // ---------------------------
      // Approve / Reject buttons (admin-only)
      // Custom IDs:
      //   cert_approve:<appId>
      //   cert_reject:<appId>
      // ---------------------------
      if (
        customId.startsWith("cert_approve:") ||
        customId.startsWith("cert_reject:")
      ) {
        // Admin check
        const member = interaction.member;
        if (!member || !member.roles.cache.has(ADMIN_ROLE_ID)) {
          return interaction.reply({
            ephemeral: true,
            content: "❌ Only admins may perform this action.",
          });
        }

        const [action, appId] = customId.split(":");
        const app = await Certificate.findById(appId);
        if (!app) {
          return interaction.reply({
            ephemeral: true,
            content: "❌ Application not found.",
          });
        }

        // APPROVE
        if (action === "cert_approve") {
          if (app.status !== "pending") {
            return interaction.reply({
              ephemeral: true,
              content: "⚠️ This application has already been processed.",
            });
          }

          // defer ephemeral reply while we update DB and DM the user
          await interaction.deferReply({ ephemeral: true });

          // Update DB
          app.status = "approved";
          app.moderatorId = interaction.user.id;
          app.resolvedAt = new Date();
          await app.save();

          // If resource contributor type, try to give role in guild (best-effort)
          try {
            if (
              interaction.guild &&
              app.type.toLowerCase().includes("resource")
            ) {
              const guildMember = await interaction.guild.members
                .fetch(app.userId)
                .catch(() => null);
              if (guildMember)
                await guildMember.roles
                  .add(RESOURCE_CONTRIBUTOR_ROLE)
                  .catch(() => {});
            }
          } catch (err) {
            // ignore
          }

          // DM applicant: tell them to email or ask mods to use /submit-cert-details
          try {
            const u = await client.users.fetch(app.userId).catch(() => null);
            if (u) {
              await u
                .send({
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
                })
                .catch(() => {});
            }
          } catch (err) {
            console.log(err);
            // Send update
            try {
              const updatesCh = await client.channels.fetch(
                CERT_UPDATES_CHANNEL
              );
              const applicantUser = await client.users.fetch(app.userId);

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
                content: `<@${applicantUser.id}>`, // 👈 ping the user
                embeds: [updateEmbed],
              });
            } catch (err) {
              console.error(err);
            }
          }

          // Post to review channel
          try {
            const reviewCh = await client.channels
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
        }

        // REJECT → show modal (do NOT defer before showModal)
        if (action === "cert_reject") {
          if (app.status !== "pending") {
            return interaction.reply({
              ephemeral: true,
              content: "⚠️ This application has already been processed.",
            });
          }

          // Build and show modal for rejection reason
          const modal = new ModalBuilder()
            .setCustomId(`cert_reject_modal:${appId}`)
            .setTitle("Reject Certificate Application");

          const reasonInput = new TextInputBuilder()
            .setCustomId("reject_reason")
            .setLabel("Rejection Reason")
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder("Explain briefly why this application is rejected")
            .setRequired(true)
            .setMinLength(3)
            .setMaxLength(1000);

          modal.addComponents(
            new ActionRowBuilder().addComponents(reasonInput)
          );

          // show modal (no defer before)
          return interaction.showModal(modal);
        }
      }

      return;
    } catch (err) {
      console.error("[certificates] Interaction handler error:", err);
      // Best-effort safe reply
      try {
        if (interaction && !interaction.replied && !interaction.deferred) {
          await interaction.reply({
            ephemeral: true,
            content: "⚠️ An error occurred while processing this interaction.",
          });
        } else if (interaction && interaction.deferred) {
          await interaction.editReply({
            content: "⚠️ An error occurred while processing this interaction.",
          });
        }
      } catch {}
    }
  });
};
