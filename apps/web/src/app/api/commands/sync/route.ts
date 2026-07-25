import { NextResponse } from "next/server";
import { registerGuildCommandsFromCatalog } from "@ralevel/shared/commandPermissions";
import { getCommandCatalog } from "@ralevel/shared/commandCatalog";
import { getOrCreateGuildConfig, guildConfigToJson } from "@/lib/db";
import { requireAllowlistedAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST() {
  const authResult = await requireAllowlistedAuth();
  if (!authResult.authorized) {
    return NextResponse.json(
      { error: authResult.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: authResult.status },
    );
  }

  const token = process.env.TOKEN;
  const clientId = process.env.CLIENT_ID;
  const guildId = process.env.GUILD_ID;

  if (!token || !clientId || !guildId) {
    return NextResponse.json(
      {
        error:
          "TOKEN, CLIENT_ID, and GUILD_ID must be set for Discord command sync.",
      },
      { status: 500 },
    );
  }

  try {
    const doc = await getOrCreateGuildConfig();
    const config = guildConfigToJson(doc);
    const overrides =
      (config.commandDiscordPermissions as Record<string, string> | undefined) ??
      {};

    const result = await registerGuildCommandsFromCatalog({
      token,
      clientId,
      guildId,
      catalogCommands: getCommandCatalog(),
      overrides,
    });

    return NextResponse.json({
      ok: true,
      commandCount: result.commandCount,
    });
  } catch (err) {
    console.error("[POST /api/commands/sync]", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to sync commands to Discord",
      },
      { status: 500 },
    );
  }
}
