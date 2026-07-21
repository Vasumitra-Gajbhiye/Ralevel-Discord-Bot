const { GuildConfig, buildDefaultGuildConfig } = require("@ralevel/db");
const {
  setGuildConfig,
  toPlainConfig,
} = require("./guildConfigStore");

/**
 * Load GuildConfig for GUILD_ID. Creates from env defaults if missing.
 * Attaches plain config to client.guildConfig and process cache.
 */
async function loadGuildConfig(client) {
  const guildId = process.env.GUILD_ID;
  if (!guildId) {
    throw new Error("GUILD_ID is required to load GuildConfig");
  }

  let doc = await GuildConfig.findOne({ guildId });
  if (!doc) {
    console.log(`[GuildConfig] No document for ${guildId}; seeding from env…`);
    doc = await GuildConfig.create(buildDefaultGuildConfig(guildId));
  }

  const plain = toPlainConfig(doc);
  setGuildConfig(plain);
  if (client) {
    client.guildConfig = plain;
  }

  console.log(
    `[GuildConfig] Loaded for guild ${guildId} (updatedAt=${doc.updatedAt?.toISOString?.() || doc.updatedAt})`,
  );
  return plain;
}

module.exports = loadGuildConfig;
