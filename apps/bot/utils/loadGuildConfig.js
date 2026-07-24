const { GuildConfig, buildDefaultGuildConfig, migrateGuildConfigDocument } = require("@ralevel/db");
const {
  setGuildConfig,
  toPlainConfig,
} = require("./guildConfigStore");

const POLL_INTERVAL_MS = 15_000;

/** @type {Date | string | null} */
let lastSeenUpdatedAt = null;
let reloadInFlight = false;

function updatedAtKey(value) {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value?.toISOString === "function") return value.toISOString();
  return String(value);
}

function applyConfig(client, doc, { logLabel }) {
  const plain = toPlainConfig(doc);
  setGuildConfig(plain);
  if (client) {
    client.guildConfig = plain;
  }
  lastSeenUpdatedAt = updatedAtKey(doc.updatedAt);
  console.log(
    `[GuildConfig] ${logLabel} for guild ${doc.guildId} (updatedAt=${lastSeenUpdatedAt})`,
  );
  return plain;
}

/**
 * Load GuildConfig for GUILD_ID. Creates from env defaults if missing.
 * Attaches plain config to client.guildConfig and process cache.
 */
async function loadGuildConfig(client) {
  const guildId = process.env.GUILD_ID;
  if (!guildId) {
    throw new Error("GUILD_ID is required to load GuildConfig");
  }

  await migrateGuildConfigDocument(GuildConfig, guildId);

  let doc = await GuildConfig.findOne({ guildId });
  if (!doc) {
    console.log(`[GuildConfig] No document for ${guildId}; seeding from env…`);
    doc = await GuildConfig.create(buildDefaultGuildConfig(guildId));
  }

  return applyConfig(client, doc, { logLabel: "Loaded" });
}

/**
 * Re-fetch GuildConfig and refresh the in-memory cache when updatedAt changed.
 * Seeds only if the document is missing. Returns the new plain config, or null
 * when nothing changed / reload skipped.
 */
async function reloadGuildConfig(client) {
  const guildId = process.env.GUILD_ID;
  if (!guildId) {
    throw new Error("GUILD_ID is required to reload GuildConfig");
  }
  if (reloadInFlight) return null;

  reloadInFlight = true;
  try {
    let doc = await GuildConfig.findOne({ guildId });
    if (!doc) {
      console.log(`[GuildConfig] No document for ${guildId}; seeding from env…`);
      doc = await GuildConfig.create(buildDefaultGuildConfig(guildId));
      return applyConfig(client, doc, { logLabel: "Reloaded" });
    }

    const nextKey = updatedAtKey(doc.updatedAt);
    if (nextKey === lastSeenUpdatedAt) {
      return null;
    }

    return applyConfig(client, doc, { logLabel: "Reloaded" });
  } finally {
    reloadInFlight = false;
  }
}

/**
 * Poll Mongo for GuildConfig.updatedAt and hot-reload the process cache.
 * Returns a clearInterval handle.
 */
function startGuildConfigWatcher(client, intervalMs = POLL_INTERVAL_MS) {
  const timer = setInterval(() => {
    reloadGuildConfig(client).catch((err) => {
      console.error("[GuildConfig] Reload poll failed:", err);
    });
  }, intervalMs);

  if (typeof timer.unref === "function") {
    timer.unref();
  }

  console.log(
    `[GuildConfig] Watching for dashboard updates every ${intervalMs / 1000}s`,
  );
  return timer;
}

module.exports = {
  loadGuildConfig,
  reloadGuildConfig,
  startGuildConfigWatcher,
};
