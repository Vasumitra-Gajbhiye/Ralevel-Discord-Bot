/**
 * Moderation point system.
 *
 * Infractions (warn, timeout, kick, softban) award points. Active points are
 * summed (ignoring voided and expired entries); reaching the threshold bans the
 * user, and landing within `noticeDistance` of it sends a ban notice DM.
 *
 * Each entry stores its own `expiresAt`, computed from the per-source
 * `expiryDays` setting when it is created, so changing the setting only
 * affects new infractions.
 */
const {
  ModPoint,
  Warning,
  DEFAULT_MOD_POINTS,
  MOD_POINT_EXPIRY_SOURCES,
} = require("@ralevel/db");
const { renderMessageTemplate } = require("@ralevel/shared");
const { tryGetGuildConfig } = require("./guildConfigStore");
const banUser = require("./banUser");
const logModAction = require("./logModAction");
const generateActionId = require("./generateId");

const DAY_MS = 24 * 60 * 60 * 1000;

function getPointsConfig() {
  const raw = tryGetGuildConfig()?.moderation?.points || {};
  return {
    ...DEFAULT_MOD_POINTS,
    ...raw,
    expiryDays: normalizeExpiryDays(raw.expiryDays),
    values: { ...DEFAULT_MOD_POINTS.values, ...raw.values },
    autoBan: { ...DEFAULT_MOD_POINTS.autoBan, ...raw.autoBan },
  };
}

/** Per-source expiry days; a legacy single number applies to every source. */
function normalizeExpiryDays(raw) {
  if (typeof raw === "number") {
    return Object.fromEntries(MOD_POINT_EXPIRY_SOURCES.map((source) => [source, raw]));
  }
  return { ...DEFAULT_MOD_POINTS.expiryDays, ...raw };
}

/** Expiry date for a new entry of `source`, or null if it never expires. */
function computeExpiresAt(source, from = new Date(), config = getPointsConfig()) {
  const days = Number(config.expiryDays[source]) || 0;
  if (days <= 0) return null;
  return new Date(new Date(from).getTime() + days * DAY_MS);
}

/** Mongo filter matching entries that have not expired (missing = never). */
function notExpiredFilter(now = new Date()) {
  return { $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] };
}

/** Mongo filter for a user's entries that currently count toward their total. */
function activeFilter(userId) {
  return { userId, active: true, ...notExpiredFilter() };
}

/** When an entry stops counting, or null if it never expires. */
function getExpiryDate(entry) {
  return entry.expiresAt ? new Date(entry.expiresAt) : null;
}

/** Whether a point entry or warning has passed its expiry date. */
function isExpired(doc, now = Date.now()) {
  return Boolean(doc.expiresAt) && new Date(doc.expiresAt).getTime() <= now;
}

async function getActivePoints(userId, config = getPointsConfig()) {
  const entries = await ModPoint.find(activeFilter(userId))
    .sort({ createdAt: -1 })
    .lean();
  const total = Math.max(
    0,
    entries.reduce((sum, entry) => sum + (entry.points || 0), 0),
  );
  return { total, entries };
}

function getZone(total, config) {
  if (total >= config.threshold) return "ban";
  if (total >= config.threshold - config.noticeDistance) return "notice";
  return "none";
}

/**
 * Work out what an infraction would do to the user's total, without writing.
 * `points` overrides the configured value (used by /points add).
 */
async function previewInfraction(userId, source, { points } = {}) {
  const config = getPointsConfig();
  const value = points ?? config.values[source] ?? 0;

  if (!config.enabled || value <= 0) {
    return { enabled: false, config, value: 0, zone: "none" };
  }

  const { total: current } = await getActivePoints(userId, config);
  const projected = current + value;

  return {
    enabled: true,
    config,
    source,
    value,
    current,
    projected,
    threshold: config.threshold,
    remaining: Math.max(0, config.threshold - projected),
    zone: getZone(projected, config),
  };
}

function templateVars(preview, { reason, serverName, userTag, userId }) {
  return {
    points: preview.projected,
    threshold: preview.threshold,
    remaining: preview.remaining,
    awarded: preview.value,
    action: preview.source,
    reason,
    serverName,
    userTag,
    userId,
  };
}

/**
 * Extra text appended to an infraction DM: the points line (if enabled)
 * followed by the ban notice when the user is within the notice zone.
 */
function buildInfractionDmExtra(preview, ctx) {
  if (!preview.enabled) return "";
  const { config } = preview;
  const vars = templateVars(preview, ctx);
  let extra = "";

  if (config.appendToInfractionDms && config.infractionDmSuffix) {
    extra += renderMessageTemplate(config.infractionDmSuffix, vars);
  }
  if (preview.zone === "notice" && config.banNoticeTemplate) {
    extra += `\n\n${renderMessageTemplate(config.banNoticeTemplate, vars)}`;
  }
  return extra;
}

async function recordPoints({
  preview,
  userId,
  userTag,
  sourceActionId,
  moderatorId,
  moderatorTag,
  reason,
  expiresAt,
}) {
  if (!preview.enabled) return null;
  return ModPoint.create({
    userId,
    userTag,
    points: preview.value,
    source: preview.source,
    sourceActionId: sourceActionId || null,
    moderatorId,
    moderatorTag,
    reason: reason || "No reason provided",
    expiresAt:
      expiresAt !== undefined
        ? expiresAt
        : computeExpiresAt(preview.source, new Date(), preview.config),
  });
}

/**
 * Ban the user if the preview reached the threshold.
 * @returns {Promise<{ banned: boolean, error?: string, actionId?: string }>}
 */
async function enforceThreshold({ interaction, preview, user, userId, userTag, reason }) {
  if (!preview.enabled || preview.zone !== "ban") return { banned: false };

  const { config } = preview;
  const banReason = renderMessageTemplate(
    config.autoBan.reasonTemplate,
    templateVars(preview, {
      reason,
      serverName: interaction.guild.name,
      userTag,
      userId,
    }),
  );

  const result = await banUser({
    guild: interaction.guild,
    targetId: userId,
    user,
    userTag,
    reason: banReason,
    appealable: config.autoBan.appealable,
    deleteMessages: config.autoBan.deleteMessages,
  });

  if (!result.ok) {
    console.error("[modPoints] auto-ban failed:", result.error);
    return { banned: false, error: result.error };
  }

  const actionId = generateActionId();
  const botUser = interaction.client.user;
  await logModAction({
    interaction,
    userId,
    userTag,
    moderatorTag: botUser.tag,
    moderatorId: botUser.id,
    action: "points-autoban",
    reason: `${banReason} (triggered by ${interaction.user.tag})`,
    actionId,
    banAppealable: config.autoBan.appealable ? "Yes" : "No",
    deletedMessages: config.autoBan.deleteMessages,
  });

  return { banned: true, actionId };
}

async function voidPoints(filter, { reason, voidedBy }) {
  const result = await ModPoint.updateMany(
    { ...filter, active: true },
    {
      $set: {
        active: false,
        voidReason: reason || "No reason provided",
        voidedBy: voidedBy || null,
        voidedAt: new Date(),
      },
    },
  );
  return result.modifiedCount ?? 0;
}

/**
 * Give warnings and point entries created before per-entry expiry existed an
 * `expiresAt`, using the current per-source settings. Only touches documents
 * without the field, so it is safe to run on every startup.
 */
async function backfillExpiry(config = getPointsConfig()) {
  const missing = { expiresAt: { $exists: false } };
  const addDays = (field, days) =>
    days > 0
      ? [{ $set: { expiresAt: { $add: [`$${field}`, days * DAY_MS] } } }]
      : { $set: { expiresAt: null } };

  let updated = 0;
  const warnDays = Number(config.expiryDays.warn) || 0;
  updated += (await Warning.updateMany(missing, addDays("timestamp", warnDays)))
    .modifiedCount ?? 0;

  for (const source of MOD_POINT_EXPIRY_SOURCES) {
    const days = Number(config.expiryDays[source]) || 0;
    updated += (
      await ModPoint.updateMany({ ...missing, source }, addDays("createdAt", days))
    ).modifiedCount ?? 0;
  }
  // Any other/unknown source never expires
  updated += (await ModPoint.updateMany(missing, { $set: { expiresAt: null } }))
    .modifiedCount ?? 0;

  return updated;
}

/** Embed field summarizing the points outcome, or null if the system is off. */
function buildPointsField(preview, enforcement) {
  if (!preview.enabled) return null;
  let value = `+${preview.value} → **${preview.projected}/${preview.threshold}**`;
  if (enforcement?.banned) value += "\n🔨 Threshold reached — user auto-banned.";
  else if (enforcement?.error) value += `\n⚠️ Auto-ban failed: ${enforcement.error}`;
  else if (preview.zone === "notice") value += "\n⚠️ Ban notice sent.";
  return { name: "Points", value, inline: false };
}

module.exports = {
  getPointsConfig,
  computeExpiresAt,
  notExpiredFilter,
  activeFilter,
  getExpiryDate,
  isExpired,
  backfillExpiry,
  getActivePoints,
  previewInfraction,
  buildInfractionDmExtra,
  recordPoints,
  enforceThreshold,
  voidPoints,
  buildPointsField,
};
