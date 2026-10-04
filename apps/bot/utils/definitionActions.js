/**
 * Definition writes: direct changes (helpers/approvers), review requests and
 * review decisions. Callers handle replying to the interaction.
 */
const {
  Definition,
  DefinitionRequest,
  normalizeTermKey,
} = require("@ralevel/db");
const { getNextSequenceId } = require("./getNextSequenceId");
const { resolveRoleKeys } = require("./guildConfigStore");
const {
  getDefinitionsConfig,
  pickContent,
  buildReviewEmbed,
  buildReviewRow,
  buildLogEmbed,
  buildDecisionDmEmbed,
} = require("./definitions");

const DUPLICATE_KEY_ERROR = 11000;

async function fetchTextChannel(client, channelId) {
  if (!channelId) return null;
  const channel = await client.channels.fetch(channelId).catch(() => null);
  return channel?.isTextBased?.() ? channel : null;
}

/* ================= DIRECT CHANGES ================= */

async function createDefinition({ subjectId, boardId, content, author }) {
  const definitionId = await getNextSequenceId("definitionId");
  try {
    const doc = await Definition.create({
      definitionId,
      subjectId,
      boardId: boardId || "",
      ...pickContent(content),
      authorId: author.id,
      authorTag: author.tag,
    });
    return { ok: true, definition: doc.toObject() };
  } catch (err) {
    if (err?.code === DUPLICATE_KEY_ERROR) return { ok: false, reason: "duplicate" };
    throw err;
  }
}

/**
 * Apply new content to a definition. `credit` is added to contributors unless
 * they are the author. Pass baseRevision = null to skip the staleness check.
 */
async function applyDefinitionEdit({ definitionId, baseRevision, content, editor, credit }) {
  const current = await Definition.findOne({ definitionId }).lean();
  if (!current) return { ok: false, reason: "missing" };
  if (baseRevision != null && current.revision !== baseRevision) {
    return { ok: false, reason: "stale", current };
  }

  const next = pickContent(content);
  const update = {
    $set: {
      ...next,
      termKey: normalizeTermKey(next.term),
      lastEditedById: editor.id,
      lastEditedAt: new Date(),
    },
    $inc: { revision: 1 },
  };
  const alreadyCredited =
    credit &&
    (credit.id === current.authorId ||
      (current.contributors || []).some((c) => c.userId === credit.id));
  if (credit && !alreadyCredited) {
    update.$push = {
      contributors: { userId: credit.id, userTag: credit.tag, at: new Date() },
    };
  }

  try {
    const updated = await Definition.findOneAndUpdate(
      { definitionId, revision: current.revision },
      update,
      { new: true },
    ).lean();
    if (!updated) return { ok: false, reason: "stale", current };
    return { ok: true, definition: updated, previous: current };
  } catch (err) {
    if (err?.code === DUPLICATE_KEY_ERROR) return { ok: false, reason: "duplicate" };
    throw err;
  }
}

async function deleteDefinition(definitionId) {
  return Definition.findOneAndDelete({ definitionId }).lean();
}

async function logDefinitionChange(client, entry) {
  const { logChannelId } = getDefinitionsConfig();
  const channel = await fetchTextChannel(client, logChannelId);
  if (!channel) return;
  await channel
    .send({ embeds: [buildLogEmbed(entry)], allowedMentions: { parse: [] } })
    .catch((err) => console.error("[definitions] Failed to log change:", err));
}

/* ================= REVIEW REQUESTS ================= */

async function findPendingRequest(filter) {
  return DefinitionRequest.findOne({ ...filter, status: "pending" }).lean();
}

/**
 * Create a request and post it to the review channel.
 * @returns {{ ok: true, request } | { ok: false, message: string }}
 */
async function submitRequest(interaction, fields) {
  const cfg = getDefinitionsConfig();
  const channel = await fetchTextChannel(interaction.client, cfg.reviewChannelId);
  if (!channel) {
    return {
      ok: false,
      message:
        "❌ Definition reviews aren't set up yet. Ask staff to pick a review channel in the dashboard.",
    };
  }

  const pending = await DefinitionRequest.countDocuments({
    requesterId: interaction.user.id,
    status: "pending",
  });
  if (pending >= cfg.maxPendingPerUser) {
    return {
      ok: false,
      message: `❌ You already have ${pending} definition requests waiting for review. Please wait until they're reviewed.`,
    };
  }

  const requestId = await getNextSequenceId("definitionRequestId");
  const request = await DefinitionRequest.create({
    requestId,
    ...fields,
    requesterId: interaction.user.id,
    requesterTag: interaction.user.tag,
  });

  const pingIds = resolveRoleKeys(cfg.pingRoleKeys);
  let message;
  try {
    message = await channel.send({
      content: pingIds.map((id) => `<@&${id}>`).join(" ") || undefined,
      embeds: [buildReviewEmbed(request)],
      components: [buildReviewRow(request)],
      allowedMentions: { roles: pingIds },
    });
  } catch (err) {
    console.error("[definitions] Failed to post review request:", err);
    await DefinitionRequest.deleteOne({ _id: request._id });
    return {
      ok: false,
      message: "❌ Couldn't send your request for review. Please try again later.",
    };
  }

  await DefinitionRequest.updateOne(
    { _id: request._id },
    { $set: { reviewChannelId: channel.id, reviewMessageId: message.id } },
  );
  return { ok: true, request: request.toObject() };
}

/* ================= REVIEW DECISIONS ================= */

async function claimRequest(requestId, status, reviewer, extra = {}) {
  return DefinitionRequest.findOneAndUpdate(
    { requestId, status: "pending" },
    {
      $set: {
        status,
        reviewerId: reviewer.id,
        reviewerTag: reviewer.tag,
        reviewedAt: new Date(),
        ...extra,
      },
    },
    { new: true },
  ).lean();
}

async function releaseRequest(requestId) {
  await DefinitionRequest.updateOne(
    { requestId },
    {
      $set: {
        status: "pending",
        reviewerId: null,
        reviewerTag: null,
        reviewedAt: null,
      },
    },
  );
}

const STALE_MESSAGE =
  "⚠️ This definition was changed after the suggestion was made. Check the current version with `/define`, then use **Edit & approve** to apply the suggestion anyway, or reject it.";
const DUPLICATE_MESSAGE =
  "❌ Another definition in this subject and board already uses that term. Reject this request or change the term with **Edit & approve**.";

/**
 * Approve a pending request. `content` (from "Edit & approve") replaces the
 * proposal and skips the staleness check.
 * @returns {{ ok: true, request, definition } | { ok: false, message: string }}
 */
async function approveRequest(requestId, reviewer, { content } = {}) {
  const request = await claimRequest(requestId, "approved", reviewer);
  if (!request) {
    return { ok: false, message: "⚠️ This request has already been handled." };
  }

  const requester = { id: request.requesterId, tag: request.requesterTag };
  const finalContent = content || request.proposed;
  let definition;

  if (request.type === "create") {
    const result = await createDefinition({
      subjectId: request.subjectId,
      boardId: request.boardId,
      content: finalContent,
      author: requester,
    });
    if (!result.ok) {
      await releaseRequest(requestId);
      return { ok: false, message: DUPLICATE_MESSAGE };
    }
    definition = result.definition;
  } else if (request.type === "edit") {
    const result = await applyDefinitionEdit({
      definitionId: request.definitionId,
      baseRevision: content ? null : request.baseRevision,
      content: finalContent,
      editor: requester,
      credit: requester,
    });
    if (result.reason === "missing") {
      const closed = await DefinitionRequest.findOneAndUpdate(
        { requestId },
        {
          $set: {
            status: "rejected",
            rejectReason: "The definition no longer exists.",
          },
        },
        { new: true },
      ).lean();
      return { ok: true, request: closed, definition: null };
    }
    if (!result.ok) {
      await releaseRequest(requestId);
      return {
        ok: false,
        message: result.reason === "stale" ? STALE_MESSAGE : DUPLICATE_MESSAGE,
      };
    }
    definition = result.definition;
  } else {
    definition = await deleteDefinition(request.definitionId);
  }

  const extra = {
    definitionId: definition?.definitionId ?? request.definitionId,
  };
  if (content) {
    extra.proposed = pickContent(content);
    extra.reviewerEdited = true;
  }
  const finalRequest = await DefinitionRequest.findOneAndUpdate(
    { requestId },
    { $set: extra },
    { new: true },
  ).lean();

  return { ok: true, request: finalRequest, definition };
}

async function rejectRequest(requestId, reviewer, reason) {
  const request = await claimRequest(requestId, "rejected", reviewer, {
    rejectReason: reason || "",
  });
  if (!request) {
    return { ok: false, message: "⚠️ This request has already been handled." };
  }
  return { ok: true, request };
}

async function notifyRequester(client, request) {
  try {
    const user = await client.users.fetch(request.requesterId);
    await user.send({ embeds: [buildDecisionDmEmbed(request)] });
  } catch {
    // DMs closed or user left — the review message still records the outcome
  }
}

module.exports = {
  createDefinition,
  applyDefinitionEdit,
  deleteDefinition,
  logDefinitionChange,
  findPendingRequest,
  submitRequest,
  approveRequest,
  rejectRequest,
  notifyRequester,
};
