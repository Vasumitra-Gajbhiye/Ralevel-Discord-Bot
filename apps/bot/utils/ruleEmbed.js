const { EmbedBuilder } = require("discord.js");
const { getSection, REGULATIONS_URL } = require("../systems/ruleSync");

const RULE_EMBED_COLOR = 0x00aeef;
const DESC_LIMIT = 4096;

function formatSyncedFooter(meta) {
  const parts = [];
  if (meta?.lastUpdatedLabel) {
    parts.push(`Site: ${meta.lastUpdatedLabel}`);
  }
  if (meta?.fetchedAt) {
    const d = new Date(meta.fetchedAt);
    parts.push(`Synced: ${d.toUTCString()}`);
  }
  parts.push(REGULATIONS_URL);
  return parts.join(" · ").slice(0, 2048);
}

function buildRuleEmbed(rule, meta) {
  return new EmbedBuilder()
    .setColor(RULE_EMBED_COLOR)
    .setTitle(`Rule ${rule.id} — ${rule.title}`)
    .setDescription(rule.body.slice(0, DESC_LIMIT))
    .setFooter({ text: formatSyncedFooter(meta) });
}

/**
 * Suffix for a "no regulation found" reply: lists the rules of the matching
 * section if there is one, else links the full list.
 * @param {string} id normalized rule id
 */
function ruleNotFoundHint(id) {
  const major = id.split(".")[0];
  const maybeSection = getSection(major);
  return maybeSection
    ? ` Did you mean one of: ${maybeSection.ruleIds.join(", ")}?`
    : ` See all regulations: <${REGULATIONS_URL}>`;
}

module.exports = {
  RULE_EMBED_COLOR,
  DESC_LIMIT,
  formatSyncedFooter,
  buildRuleEmbed,
  ruleNotFoundHint,
};
