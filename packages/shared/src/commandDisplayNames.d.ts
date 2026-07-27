export declare const DISPLAY_NAME_PATTERN: RegExp;

export declare function normalizeNameOverrides(
  overrides?: Record<string, string> | Map<string, string>,
): Record<string, string>;

export declare function validateDisplayName(name: string): string | null;

export declare function getEffectiveCommandName(
  canonical: string,
  overrides?: Record<string, string> | Map<string, string>,
): string;

export declare function applyCommandNameOverride(
  payload: Record<string, unknown>,
  displayName: string,
): Record<string, unknown>;

export declare function buildDeployedToCanonicalMap(
  catalogCommands: Array<{ name: string }>,
  overrides?: Record<string, string> | Map<string, string>,
): Map<string, string>;

export declare function buildDeployedToCanonicalObject(
  catalogCommands: Array<{ name: string }>,
  overrides?: Record<string, string> | Map<string, string>,
): Record<string, string>;

export declare function normalizeCommandDisplayNamesForSave(
  catalogCommands: Array<{ name: string }>,
  overrides?: Record<string, string> | Map<string, string>,
): Record<string, string>;

export declare function validateCommandDisplayNames(
  catalogCommands: Array<{ name: string }>,
  overrides?: Record<string, string> | Map<string, string>,
):
  | { ok: true; displayNames: Record<string, string> }
  | { ok: false; errors: string[] };

export declare function resolveCanonicalCommandName(
  deployedName: string,
  catalogCommands: Array<{ name: string }>,
  overrides?: Record<string, string> | Map<string, string>,
): string;
