/**
 * Exam locking settings: defaults and dashboard validation.
 * Phase 0 only has the subject -> channel mapping (Settings -> Exam subjects);
 * the timing policy and key-time ladder arrive with v2.
 */

const { slugifyEntryId } = require("./definitionsConfig");

const EXAM_LOCKING_LIMITS = {
  label: 100,
  subjects: 100,
  syllabusCodesPerSubject: 30,
  channelsPerSubject: 50,
};

const ENTRY_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// Cambridge syllabus codes are four digits: 9709, 8021, 0580 …
const SYLLABUS_CODE_RE = /^\d{4}$/;
const SNOWFLAKE_RE = /^\d{17,20}$/;

function buildDefaultExamLocking() {
  return { subjects: [] };
}

function normalizeSyllabusCodes(raw, label, errors) {
  if (!Array.isArray(raw)) return [];
  const codes = [];
  for (const value of raw) {
    const code = String(value ?? "").trim();
    if (!code) continue;
    if (!SYLLABUS_CODE_RE.test(code)) {
      errors.push(
        `Subject "${label}" has an invalid syllabus code "${code}". Use the four-digit Cambridge code, e.g. 9709.`,
      );
      continue;
    }
    if (!codes.includes(code)) codes.push(code);
  }
  if (codes.length > EXAM_LOCKING_LIMITS.syllabusCodesPerSubject) {
    errors.push(
      `Subject "${label}" has more than ${EXAM_LOCKING_LIMITS.syllabusCodesPerSubject} syllabus codes.`,
    );
  }
  return codes;
}

function normalizeChannels(raw, label, errors) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const channels = [];
  for (const item of raw) {
    const entry =
      typeof item === "string"
        ? { id: item, label: "" }
        : { id: item?.id, label: item?.label };
    const id = String(entry.id ?? "").trim();
    if (!id) continue;
    if (!SNOWFLAKE_RE.test(id)) {
      errors.push(`Subject "${label}" has an invalid channel ID "${id}".`);
      continue;
    }
    if (seen.has(id)) continue;
    seen.add(id);
    channels.push({
      id,
      label: String(entry.label ?? "").trim().slice(0, EXAM_LOCKING_LIMITS.label),
    });
  }
  if (channels.length > EXAM_LOCKING_LIMITS.channelsPerSubject) {
    errors.push(
      `Subject "${label}" has more than ${EXAM_LOCKING_LIMITS.channelsPerSubject} channels.`,
    );
  }
  return channels;
}

function normalizeSubjects(raw, errors) {
  if (!Array.isArray(raw)) return [];
  if (raw.length > EXAM_LOCKING_LIMITS.subjects) {
    errors.push(`At most ${EXAM_LOCKING_LIMITS.subjects} exam subjects are allowed.`);
  }

  const seenIds = new Set();
  // syllabus code -> label of the subject that has it
  const codeOwners = new Map();
  const subjects = [];

  for (const item of raw) {
    const label = String(item?.label ?? "").trim();
    const id = String(item?.id ?? "").trim() || slugifyEntryId(label);

    if (!label) {
      errors.push("Every exam subject needs a name.");
      continue;
    }
    if (label.length > EXAM_LOCKING_LIMITS.label) {
      errors.push(
        `Exam subject name "${label}" exceeds ${EXAM_LOCKING_LIMITS.label} characters.`,
      );
    }
    if (!ENTRY_ID_RE.test(id) || id.length > 50) {
      errors.push(
        `Exam subject "${label}" has an invalid ID "${id}". Use lowercase letters, numbers and dashes.`,
      );
    }
    if (seenIds.has(id)) {
      errors.push(`Duplicate exam subject ID "${id}". IDs must be unique.`);
    }
    seenIds.add(id);

    const syllabusCodes = normalizeSyllabusCodes(item?.syllabusCodes, label, errors);
    for (const code of syllabusCodes) {
      const owner = codeOwners.get(code);
      if (owner !== undefined) {
        errors.push(
          `Syllabus ${code} is in both "${owner}" and "${label}". A syllabus can belong to one subject; add the channel to both subjects instead.`,
        );
      } else {
        codeOwners.set(code, label);
      }
    }

    subjects.push({
      id,
      label,
      syllabusCodes,
      channels: normalizeChannels(item?.channels, label, errors),
      enabled: item?.enabled !== false,
    });
  }

  return subjects;
}

/**
 * Validate dashboard input for GuildConfig.examLocking.
 * @returns {{ ok: true, examLocking: object } | { ok: false, errors: string[] }}
 */
function normalizeExamLockingConfig(raw) {
  const input = raw && typeof raw === "object" ? raw : {};
  const errors = [];

  const subjects = normalizeSubjects(input.subjects, errors);

  if (errors.length) return { ok: false, errors };
  return { ok: true, examLocking: { subjects } };
}

module.exports = {
  EXAM_LOCKING_LIMITS,
  buildDefaultExamLocking,
  normalizeExamLockingConfig,
};
