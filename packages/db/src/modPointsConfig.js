/**
 * Validates and normalizes moderation point system settings from the dashboard.
 */
const {
  DEFAULT_MOD_POINTS,
  MOD_POINT_SOURCES,
  MOD_POINT_DELETE_MESSAGE_OPTIONS,
} = require("./defaultGuildConfig");

function toInt(value, fallback) {
  if (value === "" || value == null) return fallback;
  const num = Number(value);
  if (!Number.isFinite(num)) return NaN;
  return Math.trunc(num);
}

function toText(value, fallback) {
  return typeof value === "string" ? value : fallback;
}

/**
 * Merge raw settings over the defaults and validate them.
 * @returns {{ ok: true, points: object } | { ok: false, errors: string[] }}
 */
function normalizeModPointsConfig(raw) {
  const input = raw && typeof raw === "object" ? raw : {};
  const errors = [];

  const threshold = toInt(input.threshold, DEFAULT_MOD_POINTS.threshold);
  const noticeDistance = toInt(
    input.noticeDistance,
    DEFAULT_MOD_POINTS.noticeDistance,
  );
  const expiryDays = toInt(input.expiryDays, DEFAULT_MOD_POINTS.expiryDays);

  if (!Number.isInteger(threshold) || threshold < 1) {
    errors.push("Ban threshold must be a whole number of at least 1.");
  }
  if (!Number.isInteger(noticeDistance) || noticeDistance < 0) {
    errors.push("Notice distance must be a whole number of 0 or more.");
  } else if (Number.isInteger(threshold) && noticeDistance >= threshold) {
    errors.push("Notice distance must be less than the ban threshold.");
  }
  if (!Number.isInteger(expiryDays) || expiryDays < 0) {
    errors.push("Expiry days must be a whole number of 0 or more.");
  }

  const rawValues =
    input.values && typeof input.values === "object" ? input.values : {};
  const values = {};
  for (const source of MOD_POINT_SOURCES) {
    const value = toInt(rawValues[source], DEFAULT_MOD_POINTS.values[source]);
    if (!Number.isInteger(value) || value < 0) {
      errors.push(`Points for ${source} must be a whole number of 0 or more.`);
    }
    values[source] = value;
  }

  const rawAutoBan =
    input.autoBan && typeof input.autoBan === "object" ? input.autoBan : {};
  const deleteMessages = toText(
    rawAutoBan.deleteMessages,
    DEFAULT_MOD_POINTS.autoBan.deleteMessages,
  );
  if (!MOD_POINT_DELETE_MESSAGE_OPTIONS.includes(deleteMessages)) {
    errors.push(
      `Auto-ban delete messages must be one of: ${MOD_POINT_DELETE_MESSAGE_OPTIONS.join(", ")}.`,
    );
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    points: {
      enabled: input.enabled === true,
      threshold,
      noticeDistance,
      expiryDays,
      values,
      autoBan: {
        appealable:
          typeof rawAutoBan.appealable === "boolean"
            ? rawAutoBan.appealable
            : DEFAULT_MOD_POINTS.autoBan.appealable,
        deleteMessages,
        reasonTemplate: toText(
          rawAutoBan.reasonTemplate,
          DEFAULT_MOD_POINTS.autoBan.reasonTemplate,
        ),
      },
      banNoticeTemplate: toText(
        input.banNoticeTemplate,
        DEFAULT_MOD_POINTS.banNoticeTemplate,
      ),
      appendToInfractionDms:
        typeof input.appendToInfractionDms === "boolean"
          ? input.appendToInfractionDms
          : DEFAULT_MOD_POINTS.appendToInfractionDms,
      infractionDmSuffix: toText(
        input.infractionDmSuffix,
        DEFAULT_MOD_POINTS.infractionDmSuffix,
      ),
    },
  };
}

module.exports = { normalizeModPointsConfig };
