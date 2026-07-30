import { NextResponse } from "next/server";
import {
  DISCORD_PERMISSION_OPTIONS,
  buildCatalogEntries,
} from "@ralevel/shared/commandPermissions";
import { getCommandCatalog } from "@ralevel/shared/commandCatalog";
import { extractEditableMetadata } from "@ralevel/shared/commandMetadataOverrides";
import { DEFAULT_COMMAND_EPHEMERAL } from "@ralevel/db";
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
    const nameOverrides =
      (config.commandDisplayNames as Record<string, string> | undefined) ?? {};
    const metadataOverrides =
      (config.commandMetadataOverrides as Record<string, unknown> | undefined) ??
      {};

    const catalogCommands = getCommandCatalog();
    const entries = buildCatalogEntries(
      catalogCommands,
      overrides,
      nameOverrides,
      metadataOverrides,
    );

    const catalogByName = new Map(
      catalogCommands.map((command) => [command.name, command]),
    );

    const commands = entries.map(
      ({
        category,
        name,
        displayName,
        effectiveName,
        fileDefault,
        saved,
        effective,
        payload,
      }) => {
        const catalogCommand = catalogByName.get(name);
        const defaultDescription =
          (catalogCommand?.payload?.description as string | undefined) ?? "";
        const description = (payload.description as string | undefined) ?? "";
        const editableMetadata = catalogCommand
          ? extractEditableMetadata(catalogCommand.payload, payload)
          : { description, defaultDescription, children: [] };

        return {
          category,
          name,
          displayName,
          effectiveName,
          fileDefault,
          saved,
          effective,
          description,
          defaultDescription,
          editableMetadata,
          defaultEphemeral: DEFAULT_COMMAND_EPHEMERAL[name] ?? false,
        };
      },
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
