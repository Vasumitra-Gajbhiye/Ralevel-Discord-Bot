export interface DiscordPermissionOption {
  value: string;
  label: string;
}

export declare const DISCORD_PERMISSION_OPTIONS: DiscordPermissionOption[];
export declare const DEFAULT_COMMAND_DISCORD_PERMISSIONS: Record<string, string>;
export declare const PERMISSION_BITFIELDS: Record<string, string>;

export declare function permissionNameFromBitfield(
  bitfield: string | number | null | undefined,
): string | null;

export declare function permissionBitfieldFromName(
  name: string | null | undefined,
): string | null;

export declare function buildCatalogEntries(
  catalogCommands: Array<{
    category: string;
    name: string;
    fileDefault: string | null;
    payload: Record<string, unknown>;
  }>,
  overrides?: Record<string, string> | Map<string, string>,
): Array<{
  category: string;
  name: string;
  fileDefault: string | null;
  saved: string | null | undefined;
  effective: string | null;
  payload: Record<string, unknown>;
}>;

export declare function registerGuildCommandsFromCatalog(options: {
  token: string;
  clientId: string;
  guildId: string;
  catalogCommands: Array<{
    category: string;
    name: string;
    fileDefault: string | null;
    payload: Record<string, unknown>;
  }>;
  overrides?: Record<string, string> | Map<string, string>;
}): Promise<{ commandCount: number; commands: unknown[] }>;
