/**
 * Normalizes reputation IdLabel arrays from legacy string[] or partial objects.
 */
const fs = require("node:fs");
const path = require("node:path");
const {
  buildDefaultCertPanel,
  DEFAULT_BAN_MESSAGES,
  DEFAULT_COMMAND_DISCORD_PERMISSIONS,
  DEFAULT_COMMAND_PERMISSIONS,
} = require("./defaultGuildConfig");

const CATALOG_PATH = path.resolve(
  __dirname,
  "../../shared/src/generated/commandCatalog.json",
);

const PRESERVED_ORPHAN_COMMAND_KEYS = new Set([
  "ban-appeal-approved",
  "ban-appeal-rejected",
]);

const DEFAULT_BAN_APPEAL_APPROVER_ROLE_KEYS = ["admin", "dcHead"];

const RENAMED_COMMAND_PERMISSION_KEYS = {
  "moderation-logs": "moderation-history",
};

function renameCommandPermissionKeys(map) {
  if (!map || typeof map !== "object") return { map, changed: false };

  let changed = false;
  const next =
    map instanceof Map ? new Map(map.entries()) : { ...map };

  for (const [from, to] of Object.entries(RENAMED_COMMAND_PERMISSION_KEYS)) {
    const hasFrom = map instanceof Map ? map.has(from) : from in map;
    const hasTo = map instanceof Map ? map.has(to) : to in map;
    if (!hasFrom || hasTo) continue;

    const value = map instanceof Map ? map.get(from) : map[from];
    if (map instanceof Map) {
      next.set(to, value);
      next.delete(from);
    } else {
      next[to] = value;
      delete next[from];
    }
    changed = true;
  }

  return { map: next, changed };
}

function mergeMissingCommandDefaults(existing, defaults) {
  const base =
    existing instanceof Map
      ? Object.fromEntries(existing.entries())
      : { ...(existing || {}) };
  let changed = false;

  for (const [command, value] of Object.entries(defaults)) {
    if (command in base) continue;
    base[command] = value;
    changed = true;
  }

  return { map: base, changed };
}

function loadCommandCatalog() {
  try {
    if (!fs.existsSync(CATALOG_PATH)) return { commands: [] };
    return JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8"));
  } catch {
    return { commands: [] };
  }
}

function getCatalogCommandNames(catalog) {
  return (catalog.commands || []).map((cmd) => cmd.name);
}

function buildCatalogRoleDefaults(catalog) {
  const defaults = {};
  for (const cmd of catalog.commands || []) {
    defaults[cmd.name] = DEFAULT_COMMAND_PERMISSIONS[cmd.name] ?? [];
  }
  return defaults;
}

function buildCatalogDiscordDefaults(catalog) {
  const defaults = {};
  for (const cmd of catalog.commands || []) {
    defaults[cmd.name] =
      DEFAULT_COMMAND_DISCORD_PERMISSIONS[cmd.name] ?? cmd.fileDefault ?? "";
  }
  return defaults;
}

function pruneOrphanedCommandKeys(map, catalogNames) {
  const allowed = new Set(catalogNames);
  const base =
    map instanceof Map ? Object.fromEntries(map.entries()) : { ...(map || {}) };
  let changed = false;

  for (const key of Object.keys(base)) {
    if (allowed.has(key) || PRESERVED_ORPHAN_COMMAND_KEYS.has(key)) continue;
    delete base[key];
    changed = true;
  }

  return { map: base, changed };
}

function syncCommandPermissionMap(existing, catalogDefaults, catalogNames) {
  const renamed = renameCommandPermissionKeys(existing);
  const current = renamed.changed
    ? renamed.map
    : existing instanceof Map
      ? Object.fromEntries(existing.entries())
      : { ...(existing || {}) };

  const merged = mergeMissingCommandDefaults(current, catalogDefaults);
  const pruned =
    catalogNames.length > 0
      ? pruneOrphanedCommandKeys(merged.map, catalogNames)
      : { map: merged.map, changed: false };

  return {
    map: pruned.map,
    changed: renamed.changed || merged.changed || pruned.changed,
  };
}

function resolveBanAppealApproverRoleKeys(raw) {
  const keys = raw?.moderation?.banAppealApproverRoleKeys;
  if (Array.isArray(keys) && keys.length > 0) return keys;

  const perms = raw?.commandPermissions;
  const legacy =
    perms instanceof Map
      ? perms.get("ban-appeal-approved")
      : perms?.["ban-appeal-approved"];
  if (Array.isArray(legacy) && legacy.length > 0) return legacy;

  return [...DEFAULT_BAN_APPEAL_APPROVER_ROLE_KEYS];
}
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

function normalizeRanksIdLabels(ranks) {
  if (!ranks || typeof ranks !== "object") return ranks;

  return {
    ...ranks,
    disabledChannels: normalizeIdLabels(ranks.disabledChannels),
    disabledCategories: normalizeIdLabels(ranks.disabledCategories),
  };
}

function ranksIdLabelsNeedMigration(ranks) {
  if (!ranks || typeof ranks !== "object") return false;

  for (const key of ["disabledChannels", "disabledCategories"]) {
    const arr = ranks[key];
    if (!Array.isArray(arr)) continue;
    for (const item of arr) {
      if (typeof item === "string") return true;
      if (!item || typeof item !== "object" || !item.id) return true;
    }
  }

  return false;
}

function normalizeRanksConfig(roles, ranks) {
  if (!ranks || typeof ranks !== "object") {
    return { roles: roles || [], ranks };
  }

  const normalizedRanks = normalizeRanksIdLabels(ranks);

  if (!ranksLadderNeedMigration(normalizedRanks)) {
    return { roles: roles || [], ranks: normalizedRanks };
  }

  const migrated = migrateRankLadder(roles, normalizedRanks.ladder);
  return {
    roles: migrated.roles,
    ranks: { ...normalizedRanks, ladder: migrated.ladder },
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
    $set.ranks = normalizeRanksIdLabels({
      ...raw.ranks,
      ladder: migrated.ladder,
    });
  } else if (ranksIdLabelsNeedMigration(raw.ranks)) {
    $set.ranks = normalizeRanksIdLabels(raw.ranks);
  }

  if (!raw.certificates?.panel) {
    const applicationChannel =
      Array.isArray(raw.channels) &&
      raw.channels.find((c) => c?.key === "application")?.channelId;
    $set["certificates.panel"] = buildDefaultCertPanel(
      applicationChannel || process.env.APPLICATION_CHANNEL || "",
    );
  }

  if (!raw.moderation?.banMessages) {
    $set["moderation.banMessages"] = { ...DEFAULT_BAN_MESSAGES };
  }

  if (!Array.isArray(raw.moderation?.banAppealApproverRoleKeys)) {
    $set["moderation.banAppealApproverRoleKeys"] =
      resolveBanAppealApproverRoleKeys(raw);
  }

  const catalog = loadCommandCatalog();
  const catalogNames = getCatalogCommandNames(catalog);
  const roleDefaults =
    catalogNames.length > 0
      ? buildCatalogRoleDefaults(catalog)
      : DEFAULT_COMMAND_PERMISSIONS;
  const discordDefaults =
    catalogNames.length > 0
      ? buildCatalogDiscordDefaults(catalog)
      : DEFAULT_COMMAND_DISCORD_PERMISSIONS;

  if (
    !raw.commandDiscordPermissions ||
    (raw.commandDiscordPermissions instanceof Map &&
      raw.commandDiscordPermissions.size === 0) ||
    (typeof raw.commandDiscordPermissions === "object" &&
      !Array.isArray(raw.commandDiscordPermissions) &&
      Object.keys(raw.commandDiscordPermissions).length === 0)
  ) {
    $set.commandDiscordPermissions = { ...discordDefaults };
  } else {
    const syncedDiscordPerms = syncCommandPermissionMap(
      raw.commandDiscordPermissions,
      discordDefaults,
      catalogNames,
    );
    if (syncedDiscordPerms.changed) {
      $set.commandDiscordPermissions = syncedDiscordPerms.map;
    }
  }

  const syncedCommandPerms = syncCommandPermissionMap(
    raw.commandPermissions,
    roleDefaults,
    catalogNames,
  );
  if (syncedCommandPerms.changed) {
    $set.commandPermissions = syncedCommandPerms.map;
  }

  const syncedDisplayNames = pruneOrphanedCommandKeys(
    raw.commandDisplayNames,
    catalogNames,
  );
  if (syncedDisplayNames.changed) {
    $set.commandDisplayNames = syncedDisplayNames.map;
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
    doc.ranks = normalizeRanksIdLabels({
      ...doc.ranks,
      ladder: migrated.ladder,
    });
    doc.markModified("roles");
    doc.markModified("ranks");
    changed = true;
  } else if (ranksIdLabelsNeedMigration(doc.ranks)) {
    doc.ranks = normalizeRanksIdLabels(doc.ranks);
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

  if (!Array.isArray(doc.moderation?.banAppealApproverRoleKeys)) {
    doc.moderation = doc.moderation || {};
    doc.moderation.banAppealApproverRoleKeys =
      resolveBanAppealApproverRoleKeys(doc);
    doc.markModified("moderation");
    changed = true;
  }

  const catalog = loadCommandCatalog();
  const catalogNames = getCatalogCommandNames(catalog);
  const roleDefaults =
    catalogNames.length > 0
      ? buildCatalogRoleDefaults(catalog)
      : DEFAULT_COMMAND_PERMISSIONS;
  const discordDefaults =
    catalogNames.length > 0
      ? buildCatalogDiscordDefaults(catalog)
      : DEFAULT_COMMAND_DISCORD_PERMISSIONS;

  for (const [field, defaults] of [
    ["commandPermissions", roleDefaults],
    ["commandDiscordPermissions", discordDefaults],
  ]) {
    const synced = syncCommandPermissionMap(doc[field], defaults, catalogNames);
    if (synced.changed) {
      doc[field] = synced.map;
      doc.markModified(field);
      changed = true;
    }
  }

  const syncedDisplayNames = pruneOrphanedCommandKeys(
    doc.commandDisplayNames,
    catalogNames,
  );
  if (syncedDisplayNames.changed) {
    doc.commandDisplayNames = syncedDisplayNames.map;
    doc.markModified("commandDisplayNames");
    changed = true;
  }

  return changed;
}

module.exports = {
  migrateGuildConfigDocument,
  migrateGuildConfigInPlace,
  normalizeIdLabels,
  normalizeReputationIdLabels,
  normalizeRanksIdLabels,
  migrateRankLadder,
  normalizeRanksConfig,
};
