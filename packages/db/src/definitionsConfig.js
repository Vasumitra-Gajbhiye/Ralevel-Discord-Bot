/**
 * Definitions (glossary) settings: defaults, dashboard validation and the
 * term normalisation shared by the bot, the models and the web app.
 */

const DEFINITION_LIMITS = {
  term: 100,
  definition: 1000,
  chapter: 100,
  topic: 100,
  note: 500,
  label: 100,
  maxPendingPerUser: 50,
};

const DEFAULT_DEFINITION_SUBJECTS = [
  { id: "mathematics", label: "Mathematics" },
  { id: "further-mathematics", label: "Further Mathematics" },
  { id: "physics", label: "Physics" },
  { id: "chemistry", label: "Chemistry" },
  { id: "biology", label: "Biology" },
  { id: "computer-science", label: "Computer Science" },
  { id: "economics", label: "Economics" },
  { id: "business", label: "Business" },
  { id: "accounting", label: "Accounting" },
  { id: "psychology", label: "Psychology" },
  { id: "sociology", label: "Sociology" },
  { id: "english-language", label: "English Language" },
  { id: "english-literature", label: "English Literature" },
  { id: "history", label: "History" },
  { id: "geography", label: "Geography" },
  { id: "law", label: "Law" },
];

const DEFAULT_DEFINITION_BOARDS = [
  { id: "caie", label: "Cambridge (CAIE)" },
  { id: "edexcel", label: "Edexcel" },
  { id: "aqa", label: "AQA" },
  { id: "ocr", label: "OCR" },
];

const DEFAULT_DEFINITION_APPROVER_ROLE_KEYS = ["admin", "hlpHead"];
const DEFAULT_DEFINITION_PING_ROLE_KEYS = ["hlpHead"];
const DEFAULT_DEFINITION_MAX_PENDING = 5;

const ENTRY_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function buildDefaultDefinitions() {
  return {
    subjects: DEFAULT_DEFINITION_SUBJECTS.map((s) => ({
      ...s,
      helperRoleKeys: [],
      enabled: true,
    })),
    boards: DEFAULT_DEFINITION_BOARDS.map((b) => ({ ...b, enabled: true })),
    reviewChannelId: "",
    logChannelId: "",
    approverRoleKeys: [...DEFAULT_DEFINITION_APPROVER_ROLE_KEYS],
    pingRoleKeys: [...DEFAULT_DEFINITION_PING_ROLE_KEYS],
    maxPendingPerUser: DEFAULT_DEFINITION_MAX_PENDING,
  };
}

/** Lowercase, NFKC, single-spaced — the key used for lookups and uniqueness. */
function normalizeTermKey(term) {
  return String(term ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** "Further Mathematics" -> "further-mathematics" */
function slugifyEntryId(label) {
  return String(label ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

function toStringList(raw) {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.map((v) => String(v ?? "").trim()).filter(Boolean))];
}

function normalizeEntries(raw, kind, errors, { withRoles }) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const entries = [];

  for (const item of raw) {
    const label = String(item?.label ?? "").trim();
    const id = String(item?.id ?? "").trim() || slugifyEntryId(label);

    if (!label) {
      errors.push(`Every ${kind} needs a name.`);
      continue;
    }
    if (label.length > DEFINITION_LIMITS.label) {
      errors.push(
        `${kind} name "${label}" exceeds ${DEFINITION_LIMITS.label} characters.`,
      );
    }
    if (!ENTRY_ID_RE.test(id) || id.length > 50) {
      errors.push(
        `${kind} "${label}" has an invalid ID "${id}". Use lowercase letters, numbers and dashes.`,
      );
    }
    if (seen.has(id)) {
      errors.push(`Duplicate ${kind} ID "${id}". IDs must be unique.`);
    }
    seen.add(id);

    const entry = { id, label, enabled: item?.enabled !== false };
    if (withRoles) entry.helperRoleKeys = toStringList(item?.helperRoleKeys);
    entries.push(entry);
  }

  return entries;
}

/**
 * Validate dashboard input for GuildConfig.definitions.
 * @returns {{ ok: true, definitions: object } | { ok: false, errors: string[] }}
 */
function normalizeDefinitionsConfig(raw) {
  const input = raw && typeof raw === "object" ? raw : {};
  const errors = [];

  const subjects = normalizeEntries(input.subjects, "Subject", errors, {
    withRoles: true,
  });
  const boards = normalizeEntries(input.boards, "Board", errors, {
    withRoles: false,
  });

  const maxPending = Number(
    input.maxPendingPerUser ?? DEFAULT_DEFINITION_MAX_PENDING,
  );
  if (
    !Number.isInteger(maxPending) ||
    maxPending < 1 ||
    maxPending > DEFINITION_LIMITS.maxPendingPerUser
  ) {
    errors.push(
      `Max pending submissions per user must be a whole number from 1 to ${DEFINITION_LIMITS.maxPendingPerUser}.`,
    );
  }

  const approverRoleKeys = toStringList(input.approverRoleKeys);
  if (approverRoleKeys.length === 0) {
    errors.push("Pick at least one approver role.");
  }

  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    definitions: {
      subjects,
      boards,
      reviewChannelId: String(input.reviewChannelId ?? "").trim(),
      logChannelId: String(input.logChannelId ?? "").trim(),
      approverRoleKeys,
      pingRoleKeys: toStringList(input.pingRoleKeys),
      maxPendingPerUser: maxPending,
    },
  };
}

module.exports = {
  DEFINITION_LIMITS,
  DEFAULT_DEFINITION_SUBJECTS,
  DEFAULT_DEFINITION_BOARDS,
  buildDefaultDefinitions,
  normalizeTermKey,
  slugifyEntryId,
  normalizeDefinitionsConfig,
};
