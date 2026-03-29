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

const Confession = require("../models/confession");
const ConfessionBan = require("../models/confessionBan");

const MOD_ACTION_CHANNEL = process.env.MOD_ACTION_CHANNEL;
const VENT_CHANNEL = process.env.VENT_CHANNEL;

/* ================= HELPERS ================= */

async function getNextConfessionId() {
  const last = await Confession.findOne()
    .sort({ confessionId: -1 })
    .select("confessionId")
    .lean();

  return last ? last.confessionId + 1 : 1;
}

/* Buttons shown under EVERY approved confession */
function confessionButtons(confessionId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("confess_open")
      .setLabel("Submit a confession!")
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId(`confess_reply_open:${confessionId}`)
      .setLabel("Reply")
      .setStyle(ButtonStyle.Secondary)
  );
}

/* ================= SYSTEM ================= */

module.exports = function confessionSystem(client) {
  client.on(Events.InteractionCreate, async (interaction) => {
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

      /* ---------- APPROVE / REJECT ---------- */
      if (
        !id.startsWith("confess_approve:") &&
        !id.startsWith("confess_reject:")
      ) {
        return;
      }

      await interaction.deferUpdate();

      const [action, confessionId] = id.split(":");

      const confession = await Confession.findOne({
        confessionId: Number(confessionId),
      });

      if (!confession || confession.status !== "PENDING") {
        return interaction.editReply({
          content:
            "⚠️ This confession has already been reviewed.",
          components: [],
        });
      }

      /* ---------- APPROVE ---------- */
      if (action === "confess_approve") {
        const vent = await client.channels.fetch(
          VENT_CHANNEL
        );

        const embed = new EmbedBuilder()
          .setTitle(
            `Anonymous Confession (#${confession.confessionId})`
          )
          .setDescription(confession.content)
          .setColor("#6D6AF8");

        if (confession.attachment) {
          embed.setImage(confession.attachment);
        }

        const msg = await vent.send({
          embeds: [embed],
          components: [
            confessionButtons(confession.confessionId),
          ],
        });

        const thread = await msg.startThread({
          name: `Confession #${confession.confessionId}`,
          autoArchiveDuration: 1440,
        });

        const replyEmbed = new EmbedBuilder()
  .setTitle("💬 Anonymous Reply")
  .setDescription(replyText)
  .setColor("#6D6AF8");

if (attachment) {
  replyEmbed.setImage(attachment);
}

await thread.send({
  embeds: [replyEmbed],
});

        confession.status = "APPROVED";
        confession.postedMessageId = msg.id;
        confession.threadId = thread.id;
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

        return interaction.editReply({
          content:
            "✅ Confession approved and thread created.",
          components: [],
          embeds: [],
        });
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

        return interaction.editReply({
          content: "❌ Confession rejected.",
          components: [],
          embeds: [],
        });
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

        const modChannel =
          await client.channels.fetch(
            MOD_ACTION_CHANNEL
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

        if (!targetId) {
          return interaction.reply({
            content:
              "❌ Could not determine which confession to reply to.",
            ephemeral: true,
          });
        }

        const confession = await Confession.findOne({
          confessionId: targetId,
        });

        if (!confession || !confession.threadId) {
          return interaction.reply({
            content:
              "❌ That confession does not exist or has no discussion thread.",
            ephemeral: true,
          });
        }

        const thread = await client.channels.fetch(
          confession.threadId
        );

        await thread.send({
          content:
            "💬 **Anonymous Reply**\n\n" + replyText,
          files: attachment ? [attachment] : [],
        });

        return interaction.reply({
          content:
            "✅ Your anonymous reply has been posted in the thread.",
          ephemeral: true,
        });
      }
    }
  });
};