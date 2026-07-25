import { NextResponse } from "next/server";
import {
  DISCORD_PERMISSION_OPTIONS,
  buildCatalogEntries,
} from "@ralevel/shared/commandPermissions";
import { getCommandCatalog } from "@ralevel/shared/commandCatalog";
import { getOrCreateGuildConfig, guildConfigToJson } from "@/lib/db";
import { requireAllowlistedAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const authResult = await requireAllowlistedAuth();
  if (!authResult.authorized) {
    return NextResponse.json(
      { error: authResult.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: authResult.status },
    );
  }

  try {
    const doc = await getOrCreateGuildConfig();
    const config = guildConfigToJson(doc);
    const overrides =
      (config.commandDiscordPermissions as Record<string, string> | undefined) ??
      {};

    const commands = buildCatalogEntries(getCommandCatalog(), overrides).map(
      ({ category, name, fileDefault, saved, effective }) => ({
        category,
        name,
        fileDefault,
        saved,
        effective,
      }),
    );

    return NextResponse.json({
      commands,
      permissionOptions: DISCORD_PERMISSION_OPTIONS,
    });
  } catch (err) {
    console.error("[GET /api/commands/catalog]", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to load command catalog",
      },
      { status: 500 },
    );
  }
}
