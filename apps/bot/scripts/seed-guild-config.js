/**
 * Seed GuildConfig from env (idempotent — skips if document already exists).
 *
 * Usage from repo root (with .env loaded):
 *   node apps/bot/scripts/seed-guild-config.js
 *   node apps/bot/scripts/seed-guild-config.js --force   # overwrite existing
 */
require("../loadEnv");

const {
  connectDB,
  GuildConfig,
  buildDefaultGuildConfig,
} = require("@ralevel/db");

async function main() {
  const guildId = process.env.GUILD_ID;
  if (!guildId) {
    console.error("GUILD_ID is required");
    process.exit(1);
  }

  const force = process.argv.includes("--force");
  await connectDB();

  const existing = await GuildConfig.findOne({ guildId });
  if (existing && !force) {
    console.log(
      `GuildConfig already exists for ${guildId} (updatedAt=${existing.updatedAt}). Use --force to overwrite.`,
    );
    process.exit(0);
  }

  const defaults = buildDefaultGuildConfig(guildId);

  if (existing && force) {
    Object.assign(existing, defaults);
    existing.markModified("commandPermissions");
    await existing.save();
    console.log(`Overwrote GuildConfig for ${guildId}`);
  } else {
    await GuildConfig.create(defaults);
    console.log(`Created GuildConfig for ${guildId}`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
