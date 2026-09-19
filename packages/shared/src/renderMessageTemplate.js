/**
 * Replace {key} placeholders in a message template.
 * Unknown placeholders are left unchanged.
 */
function renderMessageTemplate(template, vars = {}) {
  if (!template) return "";
  return String(template).replace(/\{(\w+)\}/g, (match, key) => {
    if (Object.prototype.hasOwnProperty.call(vars, key)) {
      const value = vars[key];
      return value == null ? "" : String(value);
    }
    return match;
  });
}

const BAN_MESSAGE_PLACEHOLDERS = [
  {
    key: "reason",
    label: "{reason}",
    description: "Ban or rejection reason entered by the moderator.",
    templates: ["Ban (appealable)", "Ban (not appealable)", "Appeal rejected"],
  },
  {
    key: "note",
    label: "{note}",
    description:
      "Moderator note on appeal approval. Defaults to “No additional notes.” if omitted.",
    templates: ["Appeal approved"],
  },
  {
    key: "serverName",
    label: "{serverName}",
    description: "Discord server name.",
    templates: [
      "Ban (appealable)",
      "Ban (not appealable)",
      "Appeal approved",
      "Appeal rejected",
    ],
  },
  {
    key: "userTag",
    label: "{userTag}",
    description: "Banned user's Discord tag (e.g. username#1234).",
    templates: [
      "Ban (appealable)",
      "Ban (not appealable)",
      "Appeal approved",
      "Appeal rejected",
    ],
  },
  {
    key: "userId",
    label: "{userId}",
    description: "Banned user's Discord user ID.",
    templates: [
      "Ban (appealable)",
      "Ban (not appealable)",
      "Appeal approved",
      "Appeal rejected",
    ],
  },
  {
    key: "appealUrl",
    label: "{appealUrl}",
    description: "Appeal form URL from the settings on this page.",
    templates: ["Ban (appealable)"],
  },
];

/** Keep in sync with @ralevel/db DEFAULT_QOTD_REMINDER_TEMPLATE. */
const DEFAULT_QOTD_REMINDER_TEMPLATE =
  `🌅 **Question and Song of the Day — Reminder**\n\n` +
  `Today’s QOTD and SOTD is assigned to:\n` +
  `👉 {currentMention}\n\n` +
  `Please post the Question and Song of the Day when ready.\n\n` +
  `🔔 **Next up:** {nextMention}\n` +
  `You’re next in rotation — please start preparing.`;

const QOTD_REMINDER_PLACEHOLDERS = [
  {
    key: "currentMention",
    label: "{currentMention}",
    description: "Mention of today’s assigned moderator.",
  },
  {
    key: "nextMention",
    label: "{nextMention}",
    description: "Mention of the next moderator in rotation.",
  },
  {
    key: "currentTag",
    label: "{currentTag}",
    description: "Display tag of today’s assigned moderator.",
  },
  {
    key: "nextTag",
    label: "{nextTag}",
    description: "Display tag of the next moderator in rotation.",
  },
  {
    key: "currentId",
    label: "{currentId}",
    description: "Discord user ID of today’s assigned moderator.",
  },
  {
    key: "nextId",
    label: "{nextId}",
    description: "Discord user ID of the next moderator in rotation.",
  },
  {
    key: "date",
    label: "{date}",
    description: "Today’s date in IST (YYYY-MM-DD).",
  },
];

module.exports = {
  renderMessageTemplate,
  BAN_MESSAGE_PLACEHOLDERS,
  DEFAULT_QOTD_REMINDER_TEMPLATE,
  QOTD_REMINDER_PLACEHOLDERS,
};
