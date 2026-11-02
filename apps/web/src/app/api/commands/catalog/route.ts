import { NextResponse } from "next/server";
import {
  DISCORD_PERMISSION_OPTIONS,
  buildCatalogEntries,
} from "@ralevel/shared/commandPermissions";
import { getCommandCatalog } from "@ralevel/shared/commandCatalog";
import {
  extractEditableMetadata,
  isChatInputPayload,
} from "@ralevel/shared/commandMetadataOverrides";
import { DEFAULT_COMMAND_EPHEMERAL, MERGED_SUBCOMMAND_KEYS } from "@ralevel/db";
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
          // Context menus ("Give Rep") have no slash, description or options.
          contextMenu: !isChatInputPayload(catalogCommand?.payload),
          defaultEphemeral: DEFAULT_COMMAND_EPHEMERAL[name] ?? false,
          // Role gates and ephemeral settings stored per subcommand ("sticky add").
          subcommands: (catalogCommand?.subcommandSettings ?? []).map((key) => {
            const subName = key.slice(name.length + 1);
            const option = (
              catalogCommand?.payload?.options as
                | Array<{ name: string; description?: string }>
                | undefined
            )?.find((opt) => opt.name === subName);
            return {
              key,
              name: subName,
              description: option?.description ?? "",
              defaultEphemeral: DEFAULT_COMMAND_EPHEMERAL[key] ?? false,
            };
          }),
        };
      },
    );

    return NextResponse.json({
      commands,
      permissionOptions: DISCORD_PERMISSION_OPTIONS,
      // Old command names whose saved settings haven't been migrated yet;
      // saving the Commands page must not drop them.
      preservedKeys: Object.keys(MERGED_SUBCOMMAND_KEYS),
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
