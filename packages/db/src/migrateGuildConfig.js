/**
 * Normalizes reputation IdLabel arrays from legacy string[] or partial objects.
 */
function normalizeIdLabels(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) =>
      typeof item === "string"
        ? { id: item, label: "" }
        : { id: String(item?.id ?? ""), label: String(item?.label ?? "") },
    )
    .filter((entry) => entry.id);
}

function normalizeReputationIdLabels(reputation) {
  if (!reputation || typeof reputation !== "object") return reputation;

  return {
    ...reputation,
    disabledChannels: normalizeIdLabels(reputation.disabledChannels),
    disabledCategories: normalizeIdLabels(reputation.disabledCategories),
    staffChannelIds: normalizeIdLabels(reputation.staffChannelIds),
  };
}

function reputationIdLabelsNeedMigration(reputation) {
  if (!reputation || typeof reputation !== "object") return false;

  for (const key of [
    "disabledChannels",
    "disabledCategories",
    "staffChannelIds",
  ]) {
    const arr = reputation[key];
    if (!Array.isArray(arr)) continue;
    for (const item of arr) {
      if (typeof item === "string") return true;
      if (!item || typeof item !== "object" || !item.id) return true;
    }
  }

  return false;
}

/**
 * Migrates legacy GuildConfig documents (fixed channel maps) to array format.
 * Uses collection-level updates so legacy BSON shapes are not lost on read.
 */
async function migrateGuildConfigDocument(GuildConfig, guildId) {
  const raw = await GuildConfig.collection.findOne({ guildId });
  if (!raw) return false;

  const $set = {};
  const $unset = {};

  if (raw.channels && !Array.isArray(raw.channels)) {
    const labels = raw.channelLabels || {};
    $set.channels = Object.entries(raw.channels).map(([key, channelId]) => ({
      key,
      label: String(labels[key] || ""),
      channelId: String(channelId || ""),
    }));
    $unset.channelLabels = "";
  }

  if (!Array.isArray(raw.categories)) {
    $set.categories = [];
  }

  if (reputationIdLabelsNeedMigration(raw.reputation)) {
    $set.reputation = normalizeReputationIdLabels(raw.reputation);
  }

  if (!Object.keys($set).length && !Object.keys($unset).length) {
    return false;
  }

  const update = {};
  if (Object.keys($set).length) update.$set = $set;
  if (Object.keys($unset).length) update.$unset = $unset;

  await GuildConfig.collection.updateOne({ guildId }, update);
  return true;
}

/**
 * In-memory migration for documents already loaded (e.g. tests).
 * Returns true if the document was modified in memory (caller should save).
 */
function migrateGuildConfigInPlace(doc) {
  if (!doc) return false;

  let changed = false;
  const channels = doc.channels;

  if (channels && !Array.isArray(channels)) {
    const labels = doc.channelLabels || {};
    doc.channels = Object.entries(channels).map(([key, channelId]) => ({
      key,
      label: String(labels[key] || ""),
      channelId: String(channelId || ""),
    }));
    doc.markModified("channels");
    doc.channelLabels = undefined;
    changed = true;
  }

  if (!Array.isArray(doc.categories)) {
    doc.categories = [];
    doc.markModified("categories");
    changed = true;
  }

  if (reputationIdLabelsNeedMigration(doc.reputation)) {
    doc.reputation = normalizeReputationIdLabels(doc.reputation);
    doc.markModified("reputation");
    changed = true;
  }

  return changed;
}

module.exports = {
  migrateGuildConfigDocument,
  migrateGuildConfigInPlace,
  normalizeIdLabels,
  normalizeReputationIdLabels,
};
