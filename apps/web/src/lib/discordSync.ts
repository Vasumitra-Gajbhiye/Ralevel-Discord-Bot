import "server-only";

import { registerGuildCommandsFromCatalog } from "@ralevel/shared/commandPermissions";
import { getCommandCatalog } from "@ralevel/shared/commandCatalog";
import { getOrCreateGuildConfig, guildConfigToJson } from "@/lib/db";

function missingEnvVars() {
  return [
    !process.env.TOKEN ? "TOKEN" : null,
    !process.env.CLIENT_ID ? "CLIENT_ID" : null,
    !process.env.GUILD_ID ? "GUILD_ID" : null,
  ].filter((name): name is string => Boolean(name));
}

async function syncDirect() {
  const token = process.env.TOKEN;
  const clientId = process.env.CLIENT_ID;
  const guildId = process.env.GUILD_ID;

  if (!token || !clientId || !guildId) {
    throw new Error("Direct Discord sync is not fully configured");
  }

  const doc = await getOrCreateGuildConfig();
  const config = guildConfigToJson(doc);
  const overrides =
    (config.commandDiscordPermissions as Record<string, string> | undefined) ??
    {};
  const nameOverrides =
    (config.commandDisplayNames as Record<string, string> | undefined) ?? {};

  return registerGuildCommandsFromCatalog({
    token,
    clientId,
    guildId,
    catalogCommands: getCommandCatalog(),
    overrides,
    nameOverrides,
  });
}

async function syncViaBotProxy() {
  const botSyncUrl = process.env.BOT_INTERNAL_SYNC_URL?.replace(/\/$/, "");
  const syncSecret = process.env.INTERNAL_SYNC_SECRET;

  if (!botSyncUrl || !syncSecret) {
    throw new Error("Bot proxy sync is not configured");
  }

  const response = await fetch(`${botSyncUrl}/internal/commands/sync`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${syncSecret}`,
    },
    cache: "no-store",
  });

  const data = (await response.json()) as {
    ok?: boolean;
    commandCount?: number;
    error?: string;
  };

  if (!response.ok) {
    throw new Error(data.error || `Bot proxy sync failed (${response.status})`);
  }

  return {
    commandCount: data.commandCount ?? 0,
  };
}

export async function syncCommandsToDiscord() {
  const missing = missingEnvVars();

  if (missing.length === 0) {
    const result = await syncDirect();
    return { commandCount: result.commandCount };
  }

  if (process.env.BOT_INTERNAL_SYNC_URL && process.env.INTERNAL_SYNC_SECRET) {
    return syncViaBotProxy();
  }

  throw new Error(
    `Missing ${missing.join(", ")} on the web server. ` +
      "Either add those variables to the web deployment, or set " +
      "BOT_INTERNAL_SYNC_URL and INTERNAL_SYNC_SECRET so the dashboard can " +
      "proxy sync through the bot container (recommended for production).",
  );
}
