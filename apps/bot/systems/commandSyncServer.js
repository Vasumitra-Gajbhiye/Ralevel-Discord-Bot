const http = require("node:http");
const { GuildConfig } = require("@ralevel/db");
const { registerGuildCommandsFromCatalog } = require("@ralevel/shared/commandPermissions");
const { getCommandCatalog } = require("@ralevel/shared/commandCatalog");

function normalizeOverrides(mapValue) {
  if (!mapValue) return {};
  if (mapValue instanceof Map) {
    return Object.fromEntries(mapValue);
  }
  return { ...mapValue };
}

async function syncGuildCommandsFromConfig() {
  const token = process.env.TOKEN;
  const clientId = process.env.CLIENT_ID;
  const guildId = process.env.GUILD_ID;

  if (!token || !clientId || !guildId) {
    const missing = [
      !token ? "TOKEN" : null,
      !clientId ? "CLIENT_ID" : null,
      !guildId ? "GUILD_ID" : null,
    ].filter(Boolean);
    throw new Error(`Bot is missing ${missing.join(", ")}`);
  }

  const doc = await GuildConfig.findOne({ guildId });
  const overrides = normalizeOverrides(doc?.commandDiscordPermissions);
  const nameOverrides = normalizeOverrides(doc?.commandDisplayNames);
  const metadataOverrides = normalizeOverrides(doc?.commandMetadataOverrides);

  return registerGuildCommandsFromCatalog({
    token,
    clientId,
    guildId,
    catalogCommands: getCommandCatalog(),
    overrides,
    nameOverrides,
    metadataOverrides,
  });
}

function sendJson(res, statusCode, body) {
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function startCommandSyncServer() {
  const port = Number(process.env.SYNC_HTTP_PORT);
  const secret = process.env.INTERNAL_SYNC_SECRET;

  if (!port) return null;

  if (!secret) {
    console.warn(
      "[CommandSync] SYNC_HTTP_PORT is set but INTERNAL_SYNC_SECRET is missing; sync server disabled",
    );
    return null;
  }

  const server = http.createServer((req, res) => {
    if (req.method !== "POST" || req.url !== "/internal/commands/sync") {
      sendJson(res, 404, { error: "Not found" });
      return;
    }

    const authHeader = req.headers.authorization || "";
    const expected = `Bearer ${secret}`;
    if (authHeader !== expected) {
      sendJson(res, 401, { error: "Unauthorized" });
      return;
    }

    syncGuildCommandsFromConfig()
      .then((result) => {
        sendJson(res, 200, { ok: true, commandCount: result.commandCount });
      })
      .catch((err) => {
        console.error("[CommandSync] Sync failed:", err);
        sendJson(res, 500, {
          error: err instanceof Error ? err.message : "Sync failed",
        });
      });
  });

  server.listen(port, "0.0.0.0", () => {
    console.log(`[CommandSync] Internal sync server listening on :${port}`);
  });

  return server;
}

module.exports = {
  startCommandSyncServer,
  syncGuildCommandsFromConfig,
};
