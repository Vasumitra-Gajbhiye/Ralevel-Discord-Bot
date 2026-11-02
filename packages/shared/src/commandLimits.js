// Discord's per-guild application command limits. A bulk overwrite over any of
// them is rejected whole, and the guild stays on its last registered set.
const COMMAND_LIMITS = {
  chatInput: 100,
  user: 5,
  message: 5,
};

const TYPE_KEYS = { 1: "chatInput", 2: "user", 3: "message" };
const TYPE_LABELS = {
  chatInput: "slash commands",
  user: "user context menus",
  message: "message context menus",
};

function countCommandsByType(payloads) {
  const counts = { chatInput: 0, user: 0, message: 0 };
  for (const payload of payloads) {
    counts[TYPE_KEYS[payload?.type ?? 1] ?? "chatInput"] += 1;
  }
  return counts;
}

/** Throws before calling Discord if the payloads exceed any per-guild limit. */
function assertCommandLimits(payloads) {
  const counts = countCommandsByType(payloads);
  const over = Object.keys(COMMAND_LIMITS)
    .filter((key) => counts[key] > COMMAND_LIMITS[key])
    .map(
      (key) =>
        `${counts[key]} ${TYPE_LABELS[key]} (limit ${COMMAND_LIMITS[key]})`,
    );

  if (over.length) {
    throw new Error(
      `Too many application commands for one guild: ${over.join(", ")}. ` +
        "Discord would reject the whole registration and keep the old command set. " +
        "Merge related commands into subcommands.",
    );
  }

  return counts;
}

module.exports = {
  COMMAND_LIMITS,
  countCommandsByType,
  assertCommandLimits,
};
