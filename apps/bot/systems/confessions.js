const { Confession, ConfessionBan, ConfessionReply } = require("@ralevel/db");
const {
  Events,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");

const { getNextConfessionId } = require("../utils/getNextConfessionId");
const {
  getGuildConfig,
  getChannelId,
  resolveRoleKeys,
  tryGetGuildConfig,
} = require("../utils/guildConfigStore");

/* ================= HELPERS ================= */

const CONFESSION_COLORS = [
  "#6D6AF8",
  "#E17055",
  "#00B894",
  "#0984E3",
  "#FDCB6E",
  "#E84393",
];

function randomConfessionColor() {
  return CONFESSION_COLORS[Math.floor(Math.random() * CONFESSION_COLORS.length)];
}

/* Buttons shown under every approved confession (Reply only if replies are allowed) */
function confessionButtons(confessionId, allowReply = true) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("confess_open")
      .setLabel("Submit a confession!")
      .setStyle(ButtonStyle.Primary)
  );

  if (allowReply) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`confess_reply_open:${confessionId}`)
        .setLabel("Reply")
        .setStyle(ButtonStyle.Secondary)
    );
  }

  return row;
}

function buildResolvedReviewPayload(confession, { decision, moderatorTag }) {
  const isApproved = decision === "approved";
  const replies = confession.allowReply ? "Yes" : "No";
  const embed = new EmbedBuilder()
    .setTitle(`Anonymous Confession (#${confession.confessionId})`)
    .setDescription(confession.content)
    .setColor(isApproved ? "#00B894" : "#ff4d4d")
    .setFooter({
      text: `${isApproved ? "Approved" : "Rejected"} by ${moderatorTag} · Replies allowed: ${replies}`,
    })
    .setTimestamp();

  if (confession.attachment) {
    embed.setImage(confession.attachment);
  }

  return {
    content: null,
    embeds: [embed],
    components: [],
  };
}

async function getOrAssignAnonymousNumber(confessionId, userId) {
  const existing = await Confession.findOne({
    confessionId,
    "anonymousRepliers.userId": userId,
  });

  if (existing) {
    const entry = existing.anonymousRepliers.find((r) => r.userId === userId);
    if (entry) return entry.number;
  }

  const confession = await Confession.findOne({ confessionId });
  if (!confession) return null;

  const number = (confession.anonymousRepliers?.length || 0) + 1;

  const updated = await Confession.findOneAndUpdate(
    {
      confessionId,
      anonymousRepliers: { $not: { $elemMatch: { userId } } },
    },
    {
      $push: {
        anonymousRepliers: { userId, number },
      },
    },
    { new: true },
  );

  if (updated) {
    const entry = updated.anonymousRepliers.find((r) => r.userId === userId);
    return entry?.number ?? number;
  }

  // Race: another request assigned this user — re-fetch
  const refetched = await Confession.findOne({ confessionId });
  const entry = refetched?.anonymousRepliers?.find((r) => r.userId === userId);
  return entry?.number ?? null;
}

/* ================= SYSTEM ================= */

module.exports = function confessionSystem(client) {
  client.on(Events.InteractionCreate, async (interaction) => {
    const cfgEarly = tryGetGuildConfig();
    if (cfgEarly?.features?.confessions === false) return;

    /* =====================================================
       BUTTON INTERACTIONS
    ===================================================== */
    if (interaction.isButton()) {
      const id = interaction.customId;

      /* ---------- OPEN CONFESSION MODAL ---------- */
      if (id === "confess_open") {
        const modal = new ModalBuilder()
          .setCustomId("confess_modal")
          .setTitle("Submit a Confession");

        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("confession_text")
              .setLabel("Confession Content")
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("attachment_url")
              .setLabel("Attachment URL (optional)")
              .setStyle(TextInputStyle.Short)
              .setRequired(false)
          )
        );

        return interaction.showModal(modal);
      }

      /* ---------- OPEN REPLY MODAL ---------- */
      if (id.startsWith("confess_reply_open")) {
        const [, confessionId] = id.split(":");

        const target = await Confession.findOne({
          confessionId: Number(confessionId),
        });

        if (target && !target.allowReply) {
          return interaction.reply({
            content: "❌ Replies are not allowed on this confession.",
            ephemeral: true,
          });
        }

        const modal = new ModalBuilder()
          .setCustomId(`confess_reply_modal:${confessionId}`)
          .setTitle("Submit a Reply");

        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("reply_text")
              .setLabel("Reply")
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("reply_to")
              .setLabel("Confession ID")
              .setPlaceholder(
                "Leave blank to reply to this confession"
              )
              .setStyle(TextInputStyle.Short)
              .setRequired(false)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("reply_attachment")
              .setLabel("Attachment URL (optional)")
              .setStyle(TextInputStyle.Short)
              .setRequired(false)
          )
        );

        return interaction.showModal(modal);
      }

      /* ---------- REPLY APPROVE / REJECT ---------- */
      if (
        id.startsWith("confess_rapprove:") ||
        id.startsWith("confess_rreject:")
      ) {
        const cfg = getGuildConfig();
        const approverRoleIds = resolveRoleKeys(
          cfg.confessions?.approverRoleKeys || [],
        );
        const member = interaction.member;
        if (
          approverRoleIds.length &&
          (!member ||
            !approverRoleIds.some((rid) => member.roles.cache.has(rid)))
        ) {
          return interaction.reply({
            content: "❌ You do not have permission to review replies.",
            ephemeral: true,
          });
        }

        await interaction.deferUpdate();

        const [action, replyDocId] = id.split(":");
        const isApprove = action === "confess_rapprove";

        const reply = await ConfessionReply.findById(replyDocId).catch(
          () => null,
        );

        if (!reply || reply.status !== "PENDING") {
          await interaction.editReply({
            content: "⚠️ This reply has already been reviewed.",
            embeds: [],
            components: [],
          });
          return;
        }

        const resolvedPayload = (decision) => {
          const embed = new EmbedBuilder()
            .setTitle(`Anonymous Reply to Confession (#${reply.confessionId})`)
            .setDescription(reply.content)
            .setColor(decision === "approved" ? "#00B894" : "#ff4d4d")
            .setFooter({
              text: `${decision === "approved" ? "Approved" : "Rejected"} by ${interaction.user.tag}`,
            })
            .setTimestamp();
          if (reply.attachment) embed.setImage(reply.attachment);
          return { content: null, embeds: [embed], components: [] };
        };

        const dmAuthor = (text) =>
          client.users
            .fetch(reply.authorId)
            .then((u) => u.send(text))
            .catch(() => {});

        /* ----- REJECT ----- */
        if (!isApprove) {
          reply.status = "REJECTED";
          reply.reviewedAt = new Date();
          reply.modActionBy = interaction.user.id;
          await reply.save();

          dmAuthor(
            `❌ Your reply to confession #${reply.confessionId} was rejected.`,
          );
          await interaction.editReply(resolvedPayload("rejected"));
          await interaction
            .followUp({ ephemeral: true, content: "❌ Reply rejected." })
            .catch(() => {});
          return;
        }

        /* ----- APPROVE ----- */
        try {
          const confession = await Confession.findOne({
            confessionId: reply.confessionId,
          });

          if (confession && !confession.allowReply) {
            await interaction
              .followUp({
                ephemeral: true,
                content:
                  "❌ Replies are disabled on this confession. Reject this reply instead.",
              })
              .catch(() => {});
            return;
          }

          if (!confession?.threadId) {
            await interaction
              .followUp({
                ephemeral: true,
                content:
                  "❌ The original confession or its thread no longer exists. Reject this reply instead.",
              })
              .catch(() => {});
            return;
          }

          const thread = await client.channels
            .fetch(confession.threadId)
            .catch(() => null);

          if (!thread?.isTextBased?.()) {
            await interaction
              .followUp({
                ephemeral: true,
                content:
                  "❌ Could not find the confession thread. Reject this reply instead.",
              })
              .catch(() => {});
            return;
          }

          const anonymousNumber = await getOrAssignAnonymousNumber(
            confession.confessionId,
            reply.authorId,
          );

          if (!anonymousNumber) {
            await interaction
              .followUp({
                ephemeral: true,
                content:
                  "❌ Could not assign an anonymous identity. The reply is still pending.",
              })
              .catch(() => {});
            return;
          }

          const replyEmbed = new EmbedBuilder()
            .setTitle(`Anonymous User #${anonymousNumber}`)
            .setDescription(reply.content)
            .setColor(randomConfessionColor());

          if (reply.attachment) replyEmbed.setImage(reply.attachment);

          const msg = await thread.send({ embeds: [replyEmbed] });

          reply.status = "APPROVED";
          reply.anonymousNumber = anonymousNumber;
          reply.messageId = msg.id;
          reply.reviewedAt = new Date();
          reply.modActionBy = interaction.user.id;
          await reply.save();

          dmAuthor(
            `✅ Your reply to confession #${reply.confessionId} has been approved and posted.`,
          );
          await interaction.editReply(resolvedPayload("approved"));
          await interaction
            .followUp({ ephemeral: true, content: "✅ Reply approved and posted." })
            .catch(() => {});
        } catch (err) {
          console.error("[confessions] Reply approve failed:", err);
          await interaction
            .followUp({
              ephemeral: true,
              content:
                "❌ Failed to approve this reply. Check bot logs — the reply is still pending.",
            })
            .catch(() => {});
        }
        return;
      }

      /* ---------- APPROVE / REJECT ---------- */
      if (
        !id.startsWith("confess_approve:") &&
        !id.startsWith("confess_reject:")
      ) {
        return;
      }

      const cfg = getGuildConfig();
      const approverRoleIds = resolveRoleKeys(
        cfg.confessions?.approverRoleKeys || [],
      );
      const member = interaction.member;
      if (
        approverRoleIds.length &&
        (!member ||
          !approverRoleIds.some((rid) => member.roles.cache.has(rid)))
      ) {
        return interaction.reply({
          content: "❌ You do not have permission to review confessions.",
          ephemeral: true,
        });
      }

      await interaction.deferUpdate();

      const [action, confessionId] = id.split(":");

      const confession = await Confession.findOne({
        confessionId: Number(confessionId),
      });

      if (!confession || confession.status !== "PENDING") {
        await interaction.editReply({
          content:
            "⚠️ This confession has already been reviewed.",
          embeds: [],
          components: [],
        });
        await interaction
          .followUp({
            ephemeral: true,
            content: "⚠️ This confession has already been reviewed.",
          })
          .catch(() => {});
        return;
      }

      /* ---------- APPROVE ---------- */
      if (action === "confess_approve") {
        try {
          const ventChannelKey =
            cfg.confessions?.ventChannelKey || "vent";
          const ventChannelId = getChannelId(ventChannelKey);

          if (!ventChannelId) {
            await interaction
              .followUp({
                ephemeral: true,
                content:
                  `❌ Vent channel \`${ventChannelKey}\` is not configured. Set it in dashboard Settings → Channels, then try Approve again.`,
              })
              .catch(() => {});
            return;
          }

          const vent = await client.channels
            .fetch(ventChannelId)
            .catch(() => null);

          if (!vent?.isTextBased?.()) {
            await interaction
              .followUp({
                ephemeral: true,
                content:
                  `❌ Could not find vent channel \`${ventChannelKey}\` (${ventChannelId}). Check the channel ID in Settings → Channels.`,
              })
              .catch(() => {});
            return;
          }

          const embed = new EmbedBuilder()
            .setTitle(
              `Anonymous Confession (#${confession.confessionId})`
            )
            .setDescription(confession.content)
            .setColor(randomConfessionColor());

          if (confession.attachment) {
            embed.setImage(confession.attachment);
          }

          const msg = await vent.send({
            embeds: [embed],
            components: [
              confessionButtons(
                confession.confessionId,
                confession.allowReply,
              ),
            ],
          });

          /* No thread when replies are disabled */
          const thread = confession.allowReply
            ? await msg.startThread({
                name: `Confession #${confession.confessionId}`,
                autoArchiveDuration: 1440,
              })
            : null;

          confession.status = "APPROVED";
          confession.postedMessageId = msg.id;
          confession.threadId = thread?.id ?? null;
          confession.reviewedAt = new Date();
          confession.modActionBy = interaction.user.id;
          await confession.save();

          client.users
            .fetch(confession.authorId)
            .then((u) =>
              u.send(
                `✅ Your confession (#${confession.confessionId}) has been approved and posted.`
              )
            )
            .catch(() => {});

          await interaction.editReply(
            buildResolvedReviewPayload(confession, {
              decision: "approved",
              moderatorTag: interaction.user.tag,
            }),
          );
          await interaction
            .followUp({
              ephemeral: true,
              content: confession.allowReply
                ? "✅ Confession approved and thread created."
                : "✅ Confession approved (replies disabled, no thread created).",
            })
            .catch(() => {});
          return;
        } catch (err) {
          console.error("[confessions] Approve failed:", err);
          await interaction
            .followUp({
              ephemeral: true,
              content:
                "❌ Failed to approve this confession. Check bot logs — the confession is still pending.",
            })
            .catch(() => {});
          return;
        }
      }

      /* ---------- REJECT ---------- */
      if (action === "confess_reject") {
        confession.status = "REJECTED";
        confession.reviewedAt = new Date();
        confession.modActionBy = interaction.user.id;
        await confession.save();

        client.users
          .fetch(confession.authorId)
          .then((u) =>
            u.send(
              `❌ Your confession (#${confession.confessionId}) was rejected.`
            )
          )
          .catch(() => {});

        await interaction.editReply(
          buildResolvedReviewPayload(confession, {
            decision: "rejected",
            moderatorTag: interaction.user.tag,
          }),
        );
        await interaction
          .followUp({
            ephemeral: true,
            content: "❌ Confession rejected.",
          })
          .catch(() => {});
        return;
      }
    }

    /* =====================================================
       MODAL SUBMISSIONS
    ===================================================== */
    if (interaction.isModalSubmit()) {
      /* ---------- CONFESS MODAL ---------- */
      if (interaction.customId === "confess_modal") {
        const banned = await ConfessionBan.findOne({
          userId: interaction.user.id,
        });

        if (banned) {
          return interaction.reply({
            content:
              "🚫 You are banned from submitting confessions.",
            ephemeral: true,
          });
        }

        const content =
          interaction.fields.getTextInputValue(
            "confession_text"
          );
        const attachment =
          interaction.fields.getTextInputValue(
            "attachment_url"
          ) || null;

        const confessionId =
          await getNextConfessionId();

        await Confession.create({
          confessionId,
          content,
          attachment,
          authorId: interaction.user.id,
        });

        const modChannelKey =
          getGuildConfig().confessions?.modChannelKey || "modAction";
        const modChannel =
          await client.channels.fetch(
            getChannelId(modChannelKey),
          );

        const embed = new EmbedBuilder()
          .setTitle(
            `Anonymous Confession (#${confessionId})`
          )
          .setDescription(content)
          .setColor("#f1c40f");

        if (attachment) embed.setImage(attachment);

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(
              `confess_approve:${confessionId}`
            )
            .setLabel("Approve")
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(
              `confess_reject:${confessionId}`
            )
            .setLabel("Reject")
            .setStyle(ButtonStyle.Danger)
        );

        await modChannel.send({
          embeds: [embed],
          components: [row],
        });

        interaction.user
          .send(
            `📨 Your confession (#${confessionId}) has been submitted for review. You’ll be notified once it’s approved or rejected.`
          )
          .catch(() => {});

        return interaction.reply({
          content:
            "📨 **Your confession has been submitted for review.**\nYou’ll be notified once it’s approved or rejected.",
          ephemeral: true,
        });
      }

      /* ---------- REPLY MODAL ---------- */
      if (
        interaction.customId.startsWith(
          "confess_reply_modal:"
        )
      ) {
        const [, contextId] =
          interaction.customId.split(":");

        const replyText =
          interaction.fields.getTextInputValue(
            "reply_text"
          );
        const manualId =
          interaction.fields.getTextInputValue("reply_to");
        const attachment =
          interaction.fields.getTextInputValue(
            "reply_attachment"
          ) || null;

        let targetId = null;

        if (manualId && manualId.trim() !== "") {
          targetId = Number(manualId);
        } else if (contextId && contextId !== "undefined") {
          targetId = Number(contextId);
        }

        if (!targetId || Number.isNaN(targetId)) {
          return interaction.reply({
            content:
              "❌ Please provide a valid confession ID or use the Reply button under a confession.",
            ephemeral: true,
          });
        }

        const banned = await ConfessionBan.findOne({
          userId: interaction.user.id,
        });

        if (banned) {
          return interaction.reply({
            content: "🚫 You are banned from submitting confessions.",
            ephemeral: true,
          });
        }

        const confession = await Confession.findOne({
          confessionId: targetId,
        });

        if (!confession) {
          return interaction.reply({
            content: "❌ That confession does not exist.",
            ephemeral: true,
          });
        }

        if (!confession.allowReply) {
          return interaction.reply({
            content:
              "❌ Replies are not allowed on this confession.",
            ephemeral: true,
          });
        }

        if (!confession.threadId) {
          return interaction.reply({
            content:
              "❌ That confession has no discussion thread.",
            ephemeral: true,
          });
        }

        const reply = await ConfessionReply.create({
          confessionId: confession.confessionId,
          authorId: interaction.user.id,
          content: replyText,
          attachment,
          status: "PENDING",
        });

        try {
          const modChannelKey =
            getGuildConfig().confessions?.modChannelKey || "modAction";
          const modChannel = await client.channels.fetch(
            getChannelId(modChannelKey),
          );

          const embed = new EmbedBuilder()
            .setTitle(
              `Anonymous Reply to Confession (#${confession.confessionId})`
            )
            .setDescription(replyText)
            .setColor("#f1c40f");

          if (attachment) embed.setImage(attachment);

          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`confess_rapprove:${reply._id}`)
              .setLabel("Approve")
              .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
              .setCustomId(`confess_rreject:${reply._id}`)
              .setLabel("Reject")
              .setStyle(ButtonStyle.Danger)
          );

          await modChannel.send({ embeds: [embed], components: [row] });
        } catch (err) {
          console.error("[confessions] Failed to send reply for review:", err);
          await ConfessionReply.deleteOne({ _id: reply._id }).catch(() => {});
          return interaction.reply({
            content:
              "❌ Could not submit your reply for review. Please try again later.",
            ephemeral: true,
          });
        }

        return interaction.reply({
          content:
            "📨 **Your reply has been submitted for review.**\nIt will appear in the thread once a moderator approves it.",
          ephemeral: true,
        });
      }
    }
  });
};