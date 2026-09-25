const { isExpired } = require("./modPoints");

const MAX_FIELDS = 25;

const toUnix = (date) => Math.floor(new Date(date).getTime() / 1000);

/**
 * Embed fields for a list of warnings: current ones first (with when they
 * expire), then expired ones marked as such. Capped at Discord's 25 fields.
 * @param {object[]} logs warnings, newest first
 * @param {(log: object) => string | null} [getModeratorName] adds a Moderator line
 * @returns {{ fields: object[], activeCount: number, expiredCount: number, hidden: number }}
 */
function buildWarningFields(logs, getModeratorName) {
  const current = logs.filter((log) => !isExpired(log));
  const expired = logs.filter((log) => isExpired(log));

  const toField = (log, isExpiredWarning) => {
    const lines = [];
    if (getModeratorName) lines.push(`**Moderator:** ${getModeratorName(log)}`);
    lines.push(`**Reason:** ${log.reason}`);
    lines.push(`**Date:** <t:${toUnix(log.timestamp)}:F>`);
    if (isExpiredWarning) {
      lines.push(`**Expired:** <t:${toUnix(log.expiresAt)}:D>`);
    } else {
      lines.push(
        `**Expires:** ${log.expiresAt ? `<t:${toUnix(log.expiresAt)}:R>` : "Never"}`,
      );
    }
    return {
      name: isExpiredWarning
        ? `⌛ Expired · Warning ID: ${log.actionId}`
        : `🚨 Warning ID: ${log.actionId}`,
      value: lines.join("\n"),
      inline: false,
    };
  };

  const all = [
    ...current.map((log) => toField(log, false)),
    ...expired.map((log) => toField(log, true)),
  ];

  return {
    fields: all.slice(0, MAX_FIELDS),
    activeCount: current.length,
    expiredCount: expired.length,
    hidden: Math.max(0, all.length - MAX_FIELDS),
  };
}

/** One-line summary for the embed description. */
function describeWarningCounts({ activeCount, expiredCount, hidden }) {
  let text = `**${activeCount}** active · **${expiredCount}** expired`;
  if (hidden > 0) text += `\n…and ${hidden} more not shown`;
  return text;
}

module.exports = { buildWarningFields, describeWarningCounts };
