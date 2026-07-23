/**
 * Normalizes reputation IdLabel arrays from legacy string[] or partial objects.
 */
const { buildDefaultCertPanel } = require("./defaultGuildConfig");
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

function mergeIdLabels(...lists) {
  const seen = new Set();
  const merged = [];

  for (const list of lists) {
    for (const entry of normalizeIdLabels(list)) {
      if (seen.has(entry.id)) continue;
      seen.add(entry.id);
      merged.push(entry);
    }
  }

  return merged;
}

function normalizeReputationIdLabels(reputation) {
  if (!reputation || typeof reputation !== "object") return reputation;

  const disabledChannels = mergeIdLabels(
    reputation.disabledChannels,
    reputation.staffChannelIds,
  );

  const { staffChannelIds: _staffChannelIds, ...rest } = reputation;

  return {
    ...rest,
    disabledChannels,
    disabledCategories: normalizeIdLabels(reputation.disabledCategories),
  };
}

function reputationIdLabelsNeedMigration(reputation) {
  if (!reputation || typeof reputation !== "object") return false;

  if ("staffChannelIds" in reputation) {
    return true;
  }

  for (const key of ["disabledChannels", "disabledCategories"]) {
    const arr = reputation[key];
    if (!Array.isArray(arr)) continue;
    for (const item of arr) {
      if (typeof item === "string") return true;
      if (!item || typeof item !== "object" || !item.id) return true;
    }
  }

  return false;
}

function migrateRankLadder(roles, ladder) {
  const rolesCopy = [...(Array.isArray(roles) ? roles : [])];
  const ladderInput = Array.isArray(ladder) ? ladder : [];

  const usedKeys = new Set(rolesCopy.map((role) => role.key).filter(Boolean));
  const roleIdToKey = Object.fromEntries(
    rolesCopy
      .filter((role) => role.key && role.roleId)
      .map((role) => [String(role.roleId), role.key]),
  );

  let nextRankNum = 1;
  function allocRankKey() {
    while (usedKeys.has(`rank${nextRankNum}`)) nextRankNum += 1;
    const key = `rank${nextRankNum}`;
    usedKeys.add(key);
    nextRankNum += 1;
    return key;
  }

  const newLadder = ladderInput.map((entry, index) => {
    const xp = Number(entry?.xp) || 0;
    const name = String(entry?.name ?? "");
    let roleKey = String(entry?.roleKey ?? "").trim();

    if (!roleKey) {
      const roleId = String(entry?.roleId ?? "").trim();
      if (roleId && roleIdToKey[roleId]) {
        roleKey = roleIdToKey[roleId];
      } else if (roleId) {
        roleKey = allocRankKey();
        const label = `Rank ${index + 1}`;
        rolesCopy.push({ key: roleKey, label, roleId });
        roleIdToKey[roleId] = roleKey;
      }
    }

    return { roleKey, xp, name };
  });

  return { roles: rolesCopy, ladder: newLadder };
}

function ranksLadderNeedMigration(ranks) {
  if (!ranks || typeof ranks !== "object") return false;
  if (!Array.isArray(ranks.ladder)) return false;

  return ranks.ladder.some((entry) => {
    if (!entry || typeof entry !== "object") return true;
    if (entry.roleId) return true;
    if (!entry.roleKey) return true;
    return false;
  });
}

function normalizeRanksConfig(roles, ranks) {
  if (!ranks || typeof ranks !== "object") {
    return { roles: roles || [], ranks };
  }
  if (!ranksLadderNeedMigration(ranks)) {
    return { roles: roles || [], ranks };
  }

  const migrated = migrateRankLadder(roles, ranks.ladder);
  return {
    roles: migrated.roles,
    ranks: { ...ranks, ladder: migrated.ladder },
  };
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

  if (ranksLadderNeedMigration(raw.ranks)) {
    const migrated = migrateRankLadder(raw.roles, raw.ranks.ladder);
    $set.roles = migrated.roles;
    $set.ranks = { ...raw.ranks, ladder: migrated.ladder };
  }

  if (!raw.certificates?.panel) {
    const applicationChannel =
      Array.isArray(raw.channels) &&
      raw.channels.find((c) => c?.key === "application")?.channelId;
    $set["certificates.panel"] = buildDefaultCertPanel(
      applicationChannel || process.env.APPLICATION_CHANNEL || "",
    );
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

  if (doc.reputation?.staffChannelIds !== undefined) {
    delete doc.reputation.staffChannelIds;
    doc.markModified("reputation");
    changed = true;
  }

  if (ranksLadderNeedMigration(doc.ranks)) {
    const migrated = migrateRankLadder(doc.roles, doc.ranks.ladder);
    doc.roles = migrated.roles;
    doc.ranks = { ...doc.ranks, ladder: migrated.ladder };
    doc.markModified("roles");
    doc.markModified("ranks");
    changed = true;
  }

  if (!doc.certificates?.panel) {
    const applicationChannel =
      Array.isArray(doc.channels) &&
      doc.channels.find((c) => c?.key === "application")?.channelId;
    doc.certificates = doc.certificates || {};
    doc.certificates.panel = buildDefaultCertPanel(
      applicationChannel || process.env.APPLICATION_CHANNEL || "",
    );
    doc.markModified("certificates");
    changed = true;
  }

  return changed;
}

module.exports = {
  migrateGuildConfigDocument,
  migrateGuildConfigInPlace,
  normalizeIdLabels,
  normalizeReputationIdLabels,
  migrateRankLadder,
  normalizeRanksConfig,
};
