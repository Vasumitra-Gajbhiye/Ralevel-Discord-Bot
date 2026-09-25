/**
 * Definitions buttons and modals:
 *  - "Suggest improvement" on /define results (and the /edit-define modal)
 *  - Approve / Edit & approve / Reject on review requests
 * Custom IDs carry the IDs they act on, so buttons keep working after restarts.
 */
const { Events } = require("discord.js");
const { Definition, DefinitionRequest, normalizeTermKey } = require("@ralevel/db");
const {
  getDefinitionsConfig,
  isApprover,
  canModifyDirectly,
  cleanContent,
  pickContent,
  contentChanged,
  findDefinitionByKey,
  buildDefinitionEmbed,
  buildReviewEmbed,
  buildEditModal,
  buildReviewEditModal,
  buildRejectModal,
  readContentFromModal,
} = require("../utils/definitions");
const {
  applyDefinitionEdit,
  logDefinitionChange,
  findPendingRequest,
  submitRequest,
  approveRequest,
  rejectRequest,
  notifyRequester,
} = require("../utils/definitionActions");

const DISABLED_MESSAGE = "📘 Definitions are currently turned off.";
const NOT_APPROVER_MESSAGE =
  "❌ Only definition approvers can review requests.";

function ephemeral(content) {
  return { content, ephemeral: true };
}

/* ================= SUGGEST / EDIT ================= */

async function openEditModal(interaction, definitionId) {
  const definition = await Definition.findOne({ definitionId }).lean();
  if (!definition) {
    return interaction.reply(ephemeral("❌ That definition no longer exists."));
  }
  return interaction.showModal(buildEditModal(definition));
}

/**
 * Handles the edit modal from /edit-define and "Suggest improvement".
 * Approvers and the helper who wrote it edit directly; everyone else's
 * change goes to review.
 */
async function handleEditSubmit(interaction, definitionId, baseRevision) {
  await interaction.deferReply({ ephemeral: true });

  const definition = await Definition.findOne({ definitionId }).lean();
  if (!definition) {
    return interaction.editReply("❌ That definition no longer exists.");
  }

  const { content: raw, note } = readContentFromModal(interaction);
  const cleaned = cleanContent(raw);
  if (!cleaned.ok) return interaction.editReply(cleaned.error);
  const content = cleaned.content;

  if (!contentChanged(definition, content)) {
    return interaction.editReply("ℹ️ Nothing changed, so there's nothing to save.");
  }

  const termKey = normalizeTermKey(content.term);
  if (termKey !== definition.termKey) {
    const clash = await findDefinitionByKey({
      subjectId: definition.subjectId,
      boardId: definition.boardId,
      termKey,
    });
    if (clash) {
      return interaction.editReply(
        `❌ **${clash.term}** already exists in this subject and board (definition #${clash.definitionId}).`,
      );
    }
  }

  const user = { id: interaction.user.id, tag: interaction.user.tag };

  if (canModifyDirectly(interaction.member, user.id, definition)) {
    const result = await applyDefinitionEdit({
      definitionId,
      baseRevision,
      content,
      editor: user,
      credit: user,
    });
    if (!result.ok) {
      const messages = {
        missing: "❌ That definition no longer exists.",
        stale:
          "⚠️ Someone changed this definition while you were editing. Open it again to see the latest version.",
        duplicate: "❌ Another definition in this subject and board already uses that term.",
      };
      return interaction.editReply(messages[result.reason]);
    }

    await logDefinitionChange(interaction.client, {
      action: "edited",
      definition: result.definition,
      actor: user,
      note,
    });
    return interaction.editReply({
      content: "✅ Definition updated.",
      embeds: [buildDefinitionEmbed(result.definition)],
    });
  }

  const existing = await findPendingRequest({
    type: "edit",
    definitionId,
    requesterId: user.id,
  });
  if (existing) {
    return interaction.editReply(
      `❌ You already have a suggestion for this definition waiting for review (request #${existing.requestId}).`,
    );
  }

  const result = await submitRequest(interaction, {
    type: "edit",
    definitionId,
    // The version the form was opened on, so later changes are caught at review
    baseRevision: baseRevision ?? definition.revision,
    subjectId: definition.subjectId,
    boardId: definition.boardId,
    termKey,
    proposed: content,
    original: pickContent(definition),
    note,
  });
  if (!result.ok) return interaction.editReply(result.message);

  return interaction.editReply(
    `📨 Thanks! Your suggestion was sent for review as request **#${result.request.requestId}**. You'll get a DM when it's reviewed, and you'll be credited if it's accepted.`,
  );
}

/* ================= REVIEW ================= */

async function loadPendingRequest(interaction, requestId) {
  const request = await DefinitionRequest.findOne({ requestId }).lean();
  if (!request) {
    await interaction.reply(ephemeral("❌ That request no longer exists."));
    return null;
  }
  if (request.status !== "pending") {
    await interaction.reply(
      ephemeral("⚠️ This request has already been handled."),
    );
    return null;
  }
  return request;
}

/** Replace the review message with its resolved state and DM the requester. */
async function finishReview(interaction, request) {
  await interaction.editReply({
    content: null,
    embeds: [buildReviewEmbed(request)],
    components: [],
  });
  await notifyRequester(interaction.client, request);
}

async function handleApprove(interaction, requestId, content) {
  await interaction.deferUpdate();
  const reviewer = { id: interaction.user.id, tag: interaction.user.tag };
  const result = await approveRequest(requestId, reviewer, { content });
  if (!result.ok) {
    return interaction.followUp(ephemeral(result.message));
  }
  return finishReview(interaction, result.request);
}

async function handleReject(interaction, requestId, reason) {
  await interaction.deferUpdate();
  const reviewer = { id: interaction.user.id, tag: interaction.user.tag };
  const result = await rejectRequest(requestId, reviewer, reason);
  if (!result.ok) {
    return interaction.followUp(ephemeral(result.message));
  }
  return finishReview(interaction, result.request);
}

/* ================= ROUTER ================= */

async function handleButton(interaction, action, id) {
  if (action === "suggest") return openEditModal(interaction, id);

  if (!isApprover(interaction.member)) {
    return interaction.reply(ephemeral(NOT_APPROVER_MESSAGE));
  }

  if (action === "approve") return handleApprove(interaction, id);

  if (action === "review-edit") {
    const request = await loadPendingRequest(interaction, id);
    if (!request) return;
    return interaction.showModal(buildReviewEditModal(request));
  }

  if (action === "reject") {
    const request = await loadPendingRequest(interaction, id);
    if (!request) return;
    return interaction.showModal(buildRejectModal(id));
  }
}

async function handleModal(interaction, action, id, extra) {
  if (action === "edit-modal") {
    return handleEditSubmit(interaction, id, Number(extra) || null);
  }

  if (!isApprover(interaction.member)) {
    return interaction.reply(ephemeral(NOT_APPROVER_MESSAGE));
  }

  if (action === "review-edit-modal") {
    const { content: raw } = readContentFromModal(interaction);
    const cleaned = cleanContent(raw);
    if (!cleaned.ok) return interaction.reply(ephemeral(cleaned.error));
    return handleApprove(interaction, id, cleaned.content);
  }

  if (action === "reject-modal") {
    const { reason } = readContentFromModal(interaction);
    return handleReject(interaction, id, reason);
  }
}

module.exports = function definitionsSystem(client) {
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isButton() && !interaction.isModalSubmit()) return;
    if (!interaction.customId.startsWith("definition:")) return;

    const [, action, rawId, extra] = interaction.customId.split(":");
    const id = Number(rawId);

    try {
      if (!getDefinitionsConfig().enabled) {
        return await interaction.reply(ephemeral(DISABLED_MESSAGE));
      }
      if (interaction.isButton()) {
        await handleButton(interaction, action, id);
      } else {
        await handleModal(interaction, action, id, extra);
      }
    } catch (err) {
      console.error(`[definitions] ${interaction.customId} failed:`, err);
      const payload = ephemeral("❌ Something went wrong. Please try again.");
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(payload).catch(() => {});
      } else {
        await interaction.reply(payload).catch(() => {});
      }
    }
  });
};
