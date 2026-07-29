const path = require("node:path");
const { registerGuildCommands } = require("@ralevel/shared/registerGuildCommands");
const { tryGetGuildConfig } = require("../utils/guildConfigStore");

function getDiscordPermissionOverrides(config) {
  if (!config?.commandDiscordPermissions) return {};

  const perms = config.commandDiscordPermissions;
  if (perms instanceof Map) {
    return Object.fromEntries(perms);
  }

  return { ...perms };
}

function getCommandDisplayNameOverrides(config) {
  if (!config?.commandDisplayNames) return {};

  const names = config.commandDisplayNames;
  if (names instanceof Map) {
    return Object.fromEntries(names);
  }

  return { ...names };
}

function getCommandMetadataOverrides(config) {
  if (!config?.commandMetadataOverrides) return {};

  const metadata = config.commandMetadataOverrides;
  if (metadata instanceof Map) {
    return Object.fromEntries(metadata);
  }

  return { ...metadata };
}

function deployCommandsOnReady(client) {
  client.once("ready", async () => {
    try {
      const config = tryGetGuildConfig();
      const overrides = getDiscordPermissionOverrides(config);
      const nameOverrides = getCommandDisplayNameOverrides(config);
      const metadataOverrides = getCommandMetadataOverrides(config);
      const commandsRoot = path.join(__dirname, "..", "commands");

      const { commandCount } = await registerGuildCommands({
        token: process.env.TOKEN,
        clientId: process.env.CLIENT_ID,
        guildId: process.env.GUILD_ID,
        commandsRoot,
        overrides,
        nameOverrides,
        metadataOverrides,
      });

      console.log(
        `[deploy-commands] Registered ${commandCount} guild slash commands.`,
      );
    } catch (err) {
      console.error(
        "[deploy-commands] Failed to register guild slash commands:",
        err?.message || err,
      );
    }
  });
}

module.exports = { deployCommandsOnReady };
