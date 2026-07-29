const path = require("node:path");
require("../loadEnv");
const mongoose = require("mongoose");
const { connectDB, GuildConfig } = require("@ralevel/db");
const { registerGuildCommands } = require("@ralevel/shared/registerGuildCommands");

const token = process.env.TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;
const commandsRoot = path.join(__dirname, "..", "commands");
const MONGO_TIMEOUT_MS = 10_000;

async function loadOverrides() {
  if (!guildId) return { permissionOverrides: {}, nameOverrides: {}, metadataOverrides: {} };

  try {
    await Promise.race([
      connectDB(),
      new Promise((_, reject) => {
        setTimeout(
          () => reject(new Error(`timed out after ${MONGO_TIMEOUT_MS / 1000}s`)),
          MONGO_TIMEOUT_MS,
        );
      }),
    ]);

    const doc = await GuildConfig.findOne({ guildId });
    if (!doc) return { permissionOverrides: {}, nameOverrides: {}, metadataOverrides: {} };

    const permissionOverrides =
      doc.commandDiscordPermissions instanceof Map
        ? Object.fromEntries(doc.commandDiscordPermissions)
        : { ...(doc.commandDiscordPermissions || {}) };

    const nameOverrides =
      doc.commandDisplayNames instanceof Map
        ? Object.fromEntries(doc.commandDisplayNames)
        : { ...(doc.commandDisplayNames || {}) };

    const metadataOverrides =
      doc.commandMetadataOverrides instanceof Map
        ? Object.fromEntries(doc.commandMetadataOverrides)
        : { ...(doc.commandMetadataOverrides || {}) };

    return { permissionOverrides, nameOverrides, metadataOverrides };
  } catch (err) {
    console.warn(
      "[deploy-commands] Could not load GuildConfig overrides; using file defaults.",
      err?.message || err,
    );
    return { permissionOverrides: {}, nameOverrides: {}, metadataOverrides: {} };
  }
}

(async () => {
  let exitCode = 0;

  try {
    const { permissionOverrides, nameOverrides, metadataOverrides } = await loadOverrides();
    console.log("Started refreshing application (/) commands.");

    const { commandCount } = await registerGuildCommands({
      token,
      clientId,
      guildId,
      commandsRoot,
      overrides: permissionOverrides,
      nameOverrides,
      metadataOverrides,
    });

    console.log(`Successfully reloaded ${commandCount} application (/) commands.`);
  } catch (error) {
    console.error(error);
    exitCode = 1;
  } finally {
    await mongoose.disconnect().catch(() => {});
    process.exit(exitCode);
  }
})();
