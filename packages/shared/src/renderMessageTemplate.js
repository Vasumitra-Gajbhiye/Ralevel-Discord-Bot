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

module.exports = {
  renderMessageTemplate,
  BAN_MESSAGE_PLACEHOLDERS,
};
