const path = require("node:path");
require("../loadEnv");
const { connectDB, GuildConfig } = require("@ralevel/db");
const { registerGuildCommands } = require("@ralevel/shared/registerGuildCommands");

const token = process.env.TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;
const commandsRoot = path.join(__dirname, "..", "commands");

async function loadOverrides() {
  if (!guildId) return {};

  try {
    await connectDB();
    const doc = await GuildConfig.findOne({ guildId });
    if (!doc?.commandDiscordPermissions) return {};

    if (doc.commandDiscordPermissions instanceof Map) {
      return Object.fromEntries(doc.commandDiscordPermissions);
    }

    return { ...doc.commandDiscordPermissions };
  } catch (err) {
    console.warn(
      "[deploy-commands] Could not load GuildConfig overrides; using file defaults.",
      err?.message || err,
    );
    return {};
  }
}

(async () => {
  try {
    const overrides = await loadOverrides();
    console.log("Started refreshing application (/) commands.");

    const { commandCount } = await registerGuildCommands({
      token,
      clientId,
      guildId,
      commandsRoot,
      overrides,
    });

    console.log(`Successfully reloaded ${commandCount} application (/) commands.`);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
})();
