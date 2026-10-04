/**
 * Definitions (glossary) helpers: config access, permissions, search and the
 * embeds/components shared by /define, /add-define, /edit-define,
 * /delete-define and the review system.
 */
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");
const {
  Definition,
  DEFINITION_LIMITS,
  normalizeTermKey,
} = require("@ralevel/db");
const { tryGetGuildConfig, resolveRoleKeys } = require("./guildConfigStore");

const DEFINITION_COLOR = "#2CDAF2";
const REVIEW_COLORS = {
  pending: "#F1C40F",
  approved: "#2ECC71",
  rejected: "#E74C3C",
};
const REF_PREFIX = "id:";
const MAX_CHOICES = 25;
const CONTENT_FIELDS = ["term", "definition", "chapter", "topic"];

/* ================= CONFIG ================= */

function getDefinitionsConfig() {
  const cfg = tryGetGuildConfig();
  const d = cfg?.definitions || {};
  return {
    enabled: cfg?.features?.definitions !== false,
    subjects: Array.isArray(d.subjects) ? d.subjects : [],
    boards: Array.isArray(d.boards) ? d.boards : [],
    reviewChannelId: d.reviewChannelId || "",
    logChannelId: d.logChannelId || d.reviewChannelId || "",
    approverRoleKeys: Array.isArray(d.approverRoleKeys) ? d.approverRoleKeys : [],
    pingRoleKeys: Array.isArray(d.pingRoleKeys) ? d.pingRoleKeys : [],
    maxPendingPerUser: Number(d.maxPendingPerUser) || 5,
  };
}

function getSubject(subjectId, { enabledOnly = false } = {}) {
  const subject = getDefinitionsConfig().subjects.find((s) => s.id === subjectId);
  if (!subject || (enabledOnly && subject.enabled === false)) return null;
  return subject;
}

function getBoard(boardId, { enabledOnly = false } = {}) {
  const board = getDefinitionsConfig().boards.find((b) => b.id === boardId);
  if (!board || (enabledOnly && board.enabled === false)) return null;
  return board;
}

function subjectLabel(subjectId) {
  return getSubject(subjectId)?.label || subjectId;
}

function boardLabel(boardId) {
  if (!boardId) return "All boards";
  return getBoard(boardId)?.label || boardId;
}

/* ================= PERMISSIONS ================= */

function memberRoleIds(member) {
  if (!member) return [];
  // APIInteractionGuildMember exposes a plain array of role IDs
  if (Array.isArray(member.roles)) return member.roles;
  return [...(member.roles?.cache?.keys() ?? [])];
}

function hasAnyRoleKey(member, roleKeys) {
  const allowed = resolveRoleKeys(roleKeys || []);
  if (!allowed.length) return false;
  const own = new Set(memberRoleIds(member));
  return allowed.some((id) => own.has(id));
}

/** Can approve/reject requests and edit or delete any definition. */
function isApprover(member) {
  return hasAnyRoleKey(member, getDefinitionsConfig().approverRoleKeys);
}

function isSubjectHelper(member, subjectId) {
  const subject = getSubject(subjectId);
  return Boolean(subject) && hasAnyRoleKey(member, subject.helperRoleKeys);
}

/** New definitions from approvers and the subject's helpers skip review. */
function canAddDirectly(member, subjectId) {
  return isApprover(member) || isSubjectHelper(member, subjectId);
}

/** Helpers may change only their own definitions; everything else is reviewed. */
function canModifyDirectly(member, userId, definition) {
  if (isApprover(member)) return true;
  return (
    definition.authorId === userId &&
    isSubjectHelper(member, definition.subjectId)
  );
}

/* ================= INPUT ================= */

function cleanLine(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function cleanParagraph(value) {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Tidy and validate user-supplied definition content.
 * @returns {{ ok: true, content: object } | { ok: false, error: string }}
 */
function cleanContent(raw) {
  const content = {
    term: cleanLine(raw.term),
    definition: cleanParagraph(raw.definition),
    chapter: cleanLine(raw.chapter),
    topic: cleanLine(raw.topic),
  };

  if (!content.term) return { ok: false, error: "❌ The term can't be empty." };
  if (!content.definition) {
    return { ok: false, error: "❌ The definition can't be empty." };
  }
  for (const field of CONTENT_FIELDS) {
    if (content[field].length > DEFINITION_LIMITS[field]) {
      return {
        ok: false,
        error: `❌ The ${field} must be ${DEFINITION_LIMITS[field]} characters or fewer.`,
      };
    }
  }
  return { ok: true, content };
}

function pickContent(source) {
  return {
    term: source?.term || "",
    definition: source?.definition || "",
    chapter: source?.chapter || "",
    topic: source?.topic || "",
  };
}

function contentChanged(before, after) {
  return CONTENT_FIELDS.some((f) => (before?.[f] || "") !== (after?.[f] || ""));
}

/* ================= SEARCH ================= */

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toDefinitionRef(definitionId) {
  return `${REF_PREFIX}${definitionId}`;
}

/** Autocomplete values are "id:<n>"; anything else is text the user typed. */
function parseDefinitionRef(raw) {
  const value = String(raw ?? "").trim();
  const match = value.match(/^id:(\d+)$/i);
  if (match) return { definitionId: Number(match[1]), text: "" };
  return { definitionId: null, text: value };
}

function buildScopeFilter({ subjectId, boardId } = {}) {
  const filter = {};
  if (subjectId && getSubject(subjectId)) filter.subjectId = subjectId;
  // A board filter still includes definitions that apply to every board
  if (boardId && getBoard(boardId)) filter.boardId = { $in: [boardId, ""] };
  return filter;
}

function matchRank(termKey, key) {
  if (termKey === key) return 0;
  if (termKey.startsWith(key)) return 1;
  if (termKey.includes(` ${key}`)) return 2;
  return 3;
}

/**
 * Definitions whose term contains `query`, best matches first
 * (exact → prefix → word prefix → anywhere, then most viewed).
 */
async function searchDefinitions(query, scope = {}, limit = MAX_CHOICES) {
  const key = normalizeTermKey(query);
  const filter = buildScopeFilter(scope);
  if (key) filter.termKey = { $regex: escapeRegex(key) };

  const docs = await Definition.find(filter)
    .sort({ views: -1, termKey: 1 })
    .limit(key ? 100 : limit)
    .select("definitionId term termKey subjectId boardId chapter views")
    .lean();

  if (!key) return docs.slice(0, limit);

  return docs
    .map((doc, index) => ({ doc, index, rank: matchRank(doc.termKey, key) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .slice(0, limit)
    .map((entry) => entry.doc);
}

/**
 * Resolve a /define-style `term` option to one definition.
 * `others` lists further exact matches in other subjects/boards.
 */
async function resolveDefinition(raw, scope = {}) {
  const ref = parseDefinitionRef(raw);
  if (ref.definitionId) {
    const definition = await Definition.findOne({
      definitionId: ref.definitionId,
    }).lean();
    return { definition, others: [] };
  }

  const key = normalizeTermKey(ref.text);
  if (!key) return { definition: null, others: [] };

  const matches = await Definition.find({ ...buildScopeFilter(scope), termKey: key })
    .sort({ views: -1 })
    .limit(10)
    .lean();

  // With a board filter, prefer the board-specific version over the general one
  if (scope.boardId) {
    matches.sort(
      (a, b) =>
        Number(b.boardId === scope.boardId) - Number(a.boardId === scope.boardId),
    );
  }

  return { definition: matches[0] || null, others: matches.slice(1) };
}

async function findDefinitionByKey({ subjectId, boardId, termKey }) {
  return Definition.findOne({ subjectId, boardId: boardId || "", termKey }).lean();
}

function truncate(text, max) {
  const value = String(text ?? "");
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function definitionScopeLabel(def) {
  return def.boardId
    ? `${subjectLabel(def.subjectId)} · ${boardLabel(def.boardId)}`
    : subjectLabel(def.subjectId);
}

function definitionChoice(def) {
  return {
    name: truncate(`${def.term} · ${definitionScopeLabel(def)}`, 100),
    value: toDefinitionRef(def.definitionId),
  };
}

function rankedEntryChoices(entries, query) {
  const q = cleanLine(query).toLowerCase();
  return entries
    .filter(
      (e) => !q || e.label.toLowerCase().includes(q) || e.id.includes(q),
    )
    .sort(
      (a, b) =>
        Number(!a.label.toLowerCase().startsWith(q)) -
        Number(!b.label.toLowerCase().startsWith(q)),
    )
    .slice(0, MAX_CHOICES)
    .map((e) => ({ name: truncate(e.label, 100), value: e.id }));
}

function subjectChoices(query, { enabledOnly = true } = {}) {
  const subjects = getDefinitionsConfig().subjects.filter(
    (s) => !enabledOnly || s.enabled !== false,
  );
  return rankedEntryChoices(subjects, query);
}

function boardChoices(query, { enabledOnly = true } = {}) {
  const boards = getDefinitionsConfig().boards.filter(
    (b) => !enabledOnly || b.enabled !== false,
  );
  return rankedEntryChoices(boards, query);
}

/**
 * Chapter/topic suggestions: values already used in the subject, with the
 * typed text offered first so new values can still be entered.
 */
async function fieldValueChoices(field, query, subjectId) {
  const filter = { [field]: { $ne: "" } };
  if (subjectId && getSubject(subjectId)) filter.subjectId = subjectId;

  const typed = cleanLine(query).slice(0, DEFINITION_LIMITS[field]);
  const lower = typed.toLowerCase();
  const values = (await Definition.distinct(field, filter))
    .filter((v) => !lower || v.toLowerCase().includes(lower))
    .sort((a, b) => a.localeCompare(b));

  const choices = typed && !values.includes(typed) ? [typed, ...values] : values;
  return choices
    .slice(0, MAX_CHOICES)
    .map((v) => ({ name: truncate(v, 100), value: truncate(v, 100) }));
}

/* ================= EMBEDS ================= */

function mentionUser(userId, fallbackTag) {
  return /^\d{15,25}$/.test(String(userId)) ? `<@${userId}>` : fallbackTag || "Unknown";
}

function formatCredits(def) {
  const lines = [`Added by ${mentionUser(def.authorId, def.authorTag)}`];
  const contributors = (def.contributors || []).filter(
    (c) => c.userId !== def.authorId,
  );
  if (contributors.length) {
    const shown = contributors
      .slice(0, 10)
      .map((c) => mentionUser(c.userId, c.userTag));
    const extra = contributors.length - shown.length;
    lines.push(
      `Improved by ${shown.join(", ")}${extra > 0 ? ` and ${extra} more` : ""}`,
    );
  }
  return lines.join("\n");
}

function addScopeFields(embed, source) {
  embed.addFields(
    { name: "Subject", value: subjectLabel(source.subjectId), inline: true },
    { name: "Board", value: boardLabel(source.boardId), inline: true },
  );
}

function buildDefinitionEmbed(def) {
  const embed = new EmbedBuilder()
    .setColor(DEFINITION_COLOR)
    .setTitle(truncate(`📘 ${def.term}`, 256))
    .setDescription(def.definition);

  addScopeFields(embed, def);
  if (def.chapter) {
    embed.addFields({ name: "Chapter", value: def.chapter, inline: true });
  }
  if (def.topic) {
    embed.addFields({ name: "Topic", value: def.topic, inline: true });
  }
  embed
    .addFields({ name: "Credits", value: truncate(formatCredits(def), 1024) })
    .setFooter({ text: `Definition #${def.definitionId}` });

  return embed;
}

function buildSuggestRow(definitionId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`definition:suggest:${definitionId}`)
      .setLabel("Suggest improvement")
      .setEmoji("✏️")
      .setStyle(ButtonStyle.Secondary),
  );
}

const REQUEST_TITLES = {
  create: "📥 New definition",
  edit: "✏️ Suggested improvement",
  delete: "🗑️ Deletion request",
};

function fieldValue(text) {
  return truncate(text || "—", 1024);
}

function addChangeFields(embed, before, after) {
  for (const field of ["term", "chapter", "topic"]) {
    const from = before?.[field] || "";
    const to = after?.[field] || "";
    if (from === to) continue;
    const name = field[0].toUpperCase() + field.slice(1);
    embed.addFields({
      name,
      value: fieldValue(`${from || "—"} → **${to || "—"}**`),
    });
  }
  if ((before?.definition || "") !== (after?.definition || "")) {
    embed.addFields(
      { name: "Current definition", value: fieldValue(before?.definition) },
      { name: "Suggested definition", value: fieldValue(after?.definition) },
    );
  }
}

function buildReviewEmbed(request) {
  const status = request.status || "pending";
  const embed = new EmbedBuilder()
    .setTitle(`${REQUEST_TITLES[request.type]} · Request #${request.requestId}`)
    .setColor(REVIEW_COLORS[status] || REVIEW_COLORS.pending)
    .setTimestamp(request.createdAt ? new Date(request.createdAt) : new Date());

  addScopeFields(embed, request);
  embed.addFields({
    name: "Requested by",
    value: mentionUser(request.requesterId, request.requesterTag),
    inline: true,
  });

  if (request.type === "create") {
    const p = request.proposed || {};
    embed.addFields(
      { name: "Term", value: fieldValue(p.term) },
      { name: "Definition", value: fieldValue(p.definition) },
    );
    if (p.chapter) embed.addFields({ name: "Chapter", value: p.chapter, inline: true });
    if (p.topic) embed.addFields({ name: "Topic", value: p.topic, inline: true });
  } else if (request.type === "edit") {
    embed.addFields({
      name: "Definition",
      value: `#${request.definitionId} · ${fieldValue(request.original?.term)}`,
    });
    addChangeFields(embed, request.original, request.proposed);
    if (request.note) {
      embed.addFields({ name: "What changed", value: fieldValue(request.note) });
    }
  } else {
    embed.addFields(
      {
        name: "Definition",
        value: `#${request.definitionId} · ${fieldValue(request.original?.term)}`,
      },
      { name: "Current definition", value: fieldValue(request.original?.definition) },
      { name: "Reason", value: fieldValue(request.note) },
    );
  }

  if (status === "pending") {
    embed.setFooter({ text: "Approvers: use the buttons below." });
  } else {
    const verb = status === "approved" ? "Approved" : "Rejected";
    const by = request.reviewerTag ? ` by ${request.reviewerTag}` : "";
    const edited = request.reviewerEdited ? " (edited by reviewer)" : "";
    embed.setFooter({ text: `${verb}${by}${edited}` });
    if (status === "rejected" && request.rejectReason) {
      embed.addFields({
        name: "Rejection reason",
        value: fieldValue(request.rejectReason),
      });
    }
  }

  return embed;
}

function buildReviewRow(request) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`definition:approve:${request.requestId}`)
      .setLabel("Approve")
      .setStyle(ButtonStyle.Success),
  );
  if (request.type !== "delete") {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`definition:review-edit:${request.requestId}`)
        .setLabel("Edit & approve")
        .setStyle(ButtonStyle.Primary),
    );
  }
  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`definition:reject:${request.requestId}`)
      .setLabel("Reject")
      .setStyle(ButtonStyle.Danger),
  );
  return row;
}

const LOG_TITLES = {
  added: "📘 Definition added",
  edited: "✏️ Definition edited",
  deleted: "🗑️ Definition deleted",
};

/** Log entry for changes made without review (helpers and approvers). */
function buildLogEmbed({ action, definition, actor, note }) {
  const embed = new EmbedBuilder()
    .setTitle(truncate(`${LOG_TITLES[action]}: ${definition.term}`, 256))
    .setColor(action === "deleted" ? REVIEW_COLORS.rejected : DEFINITION_COLOR)
    .setTimestamp();

  if (action !== "deleted") embed.setDescription(definition.definition);
  addScopeFields(embed, definition);
  embed.addFields({
    name: "By",
    value: mentionUser(actor.id, actor.tag),
    inline: true,
  });
  if (note) embed.addFields({ name: action === "deleted" ? "Reason" : "Note", value: fieldValue(note) });
  embed.setFooter({ text: `Definition #${definition.definitionId}` });
  return embed;
}

function buildDecisionDmEmbed(request) {
  const approved = request.status === "approved";
  const term = request.proposed?.term || request.original?.term || "your definition";
  const subject = subjectLabel(request.subjectId);

  const summaries = {
    create: approved
      ? `**${term}** has been added to ${subject}. Look it up with \`/define\` — you're credited as the author.`
      : `Your new definition for **${term}** (${subject}) was not accepted.`,
    edit: approved
      ? `Your improvement to **${term}** (${subject}) has been applied — you're now credited on it.`
      : `Your suggested improvement to **${term}** (${subject}) was not accepted.`,
    delete: approved
      ? `**${term}** (${subject}) has been removed.`
      : `Your request to remove **${term}** (${subject}) was not accepted.`,
  };

  const embed = new EmbedBuilder()
    .setTitle(
      approved
        ? `✅ Definition request #${request.requestId} approved`
        : `❌ Definition request #${request.requestId} rejected`,
    )
    .setColor(approved ? REVIEW_COLORS.approved : REVIEW_COLORS.rejected)
    .setDescription(summaries[request.type])
    .setTimestamp();

  if (!approved && request.rejectReason) {
    embed.addFields({ name: "Reason", value: fieldValue(request.rejectReason) });
  }
  return embed;
}

/* ================= MODALS ================= */

function textInput({ id, label, style, required, max, value, placeholder }) {
  const input = new TextInputBuilder()
    .setCustomId(id)
    .setLabel(label)
    .setStyle(style)
    .setRequired(required)
    .setMaxLength(max);
  if (value) input.setValue(truncate(value, max));
  if (placeholder) input.setPlaceholder(placeholder);
  return new ActionRowBuilder().addComponents(input);
}

function contentInputs(content) {
  return [
    textInput({
      id: "term",
      label: "Term",
      style: TextInputStyle.Short,
      required: true,
      max: DEFINITION_LIMITS.term,
      value: content.term,
    }),
    textInput({
      id: "definition",
      label: "Definition",
      style: TextInputStyle.Paragraph,
      required: true,
      max: DEFINITION_LIMITS.definition,
      value: content.definition,
    }),
    textInput({
      id: "chapter",
      label: "Chapter (optional)",
      style: TextInputStyle.Short,
      required: false,
      max: DEFINITION_LIMITS.chapter,
      value: content.chapter,
    }),
    textInput({
      id: "topic",
      label: "Topic (optional)",
      style: TextInputStyle.Short,
      required: false,
      max: DEFINITION_LIMITS.topic,
      value: content.topic,
    }),
  ];
}

/** Used by /edit-define and the "Suggest improvement" button. */
function buildEditModal(def) {
  return new ModalBuilder()
    .setCustomId(`definition:edit-modal:${def.definitionId}:${def.revision ?? 1}`)
    .setTitle(truncate(`Improve: ${def.term}`, 45))
    .addComponents(
      ...contentInputs(def),
      textInput({
        id: "note",
        label: "What did you change? (optional)",
        style: TextInputStyle.Paragraph,
        required: false,
        max: DEFINITION_LIMITS.note,
        placeholder: "Shown to reviewers, e.g. fixed the units, added the mark-scheme wording",
      }),
    );
}

function buildReviewEditModal(request) {
  return new ModalBuilder()
    .setCustomId(`definition:review-edit-modal:${request.requestId}`)
    .setTitle(truncate(`Edit & approve request #${request.requestId}`, 45))
    .addComponents(...contentInputs(request.proposed || {}));
}

function buildRejectModal(requestId) {
  return new ModalBuilder()
    .setCustomId(`definition:reject-modal:${requestId}`)
    .setTitle(`Reject request #${requestId}`)
    .addComponents(
      textInput({
        id: "reason",
        label: "Reason (sent to the requester)",
        style: TextInputStyle.Paragraph,
        required: false,
        max: DEFINITION_LIMITS.note,
      }),
    );
}

function readContentFromModal(interaction) {
  const get = (id) => {
    try {
      return interaction.fields.getTextInputValue(id);
    } catch {
      return "";
    }
  };
  return {
    content: {
      term: get("term"),
      definition: get("definition"),
      chapter: get("chapter"),
      topic: get("topic"),
    },
    note: cleanParagraph(get("note")),
    reason: cleanParagraph(get("reason")),
  };
}

module.exports = {
  DEFINITION_COLOR,
  getDefinitionsConfig,
  getSubject,
  getBoard,
  subjectLabel,
  boardLabel,
  memberRoleIds,
  isApprover,
  isSubjectHelper,
  canAddDirectly,
  canModifyDirectly,
  cleanContent,
  pickContent,
  contentChanged,
  toDefinitionRef,
  parseDefinitionRef,
  searchDefinitions,
  resolveDefinition,
  findDefinitionByKey,
  definitionChoice,
  definitionScopeLabel,
  subjectChoices,
  boardChoices,
  fieldValueChoices,
  formatCredits,
  buildDefinitionEmbed,
  buildSuggestRow,
  buildReviewEmbed,
  buildReviewRow,
  buildLogEmbed,
  buildDecisionDmEmbed,
  buildEditModal,
  buildReviewEditModal,
  buildRejectModal,
  readContentFromModal,
  truncate,
};
