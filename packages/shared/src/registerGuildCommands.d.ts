export interface CommandCatalogEntry {
  category: string;
  name: string;
  fileDefault: string | null;
  saved: string | null | undefined;
  effective: string | null;
  payload: Record<string, unknown>;
}

export declare const DEFAULT_COMMAND_DISCORD_PERMISSIONS: Record<string, string>;

export declare function resolveCommandsRoot(
  explicitRoot?: string,
): string;

export declare function loadCommandPayloads(
  commandsRoot?: string,
  overrides?: Record<string, string> | Map<string, string>,
): CommandCatalogEntry[];

export declare function registerGuildCommands(options: {
  token: string;
  clientId: string;
  guildId: string;
  commandsRoot?: string;
  overrides?: Record<string, string> | Map<string, string>;
}): Promise<{ commandCount: number; commands: CommandCatalogEntry[] }>;
