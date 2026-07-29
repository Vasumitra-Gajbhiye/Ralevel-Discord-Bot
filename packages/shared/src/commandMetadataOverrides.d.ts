export declare const DESCRIPTION_MAX: number;

export interface EditableChoice {
  value: string;
  defaultName: string;
  name: string;
}

export interface EditableMetadataNode {
  kind: "subcommand" | "subcommand_group" | "option";
  name: string;
  defaultDescription: string;
  description: string;
  choices?: EditableChoice[];
  children?: EditableMetadataNode[];
}

export interface EditableMetadata {
  description: string;
  defaultDescription: string;
  children: EditableMetadataNode[];
}

export interface CommandMetadataOverride {
  description?: string;
  options?: Array<{
    name: string;
    description?: string;
    choices?: Array<{ value: string; name: string }>;
    options?: Array<{
      name: string;
      description?: string;
      choices?: Array<{ value: string; name: string }>;
      options?: unknown[];
    }>;
  }>;
}

export declare function normalizeMetadataOverrides(
  overrides?: Record<string, CommandMetadataOverride> | Map<string, CommandMetadataOverride>,
): Record<string, CommandMetadataOverride>;

export declare function applyMetadataOverride(
  basePayload: Record<string, unknown>,
  override: CommandMetadataOverride | null | undefined,
): Record<string, unknown>;

export declare function extractEditableMetadata(
  payload: Record<string, unknown>,
  effectivePayload?: Record<string, unknown>,
): EditableMetadata;

export declare function buildMetadataOverrideFromEditable(
  catalogPayload: Record<string, unknown>,
  editable: EditableMetadata,
): CommandMetadataOverride | null;

export declare function validateEditableMetadata(
  editable: EditableMetadata,
  commandName: string,
): { ok: true } | { ok: false; errors: string[] };

export declare function validateCommandMetadataOverrides(
  catalogCommands: Array<{ name: string; payload: Record<string, unknown> }>,
  overrides?: Record<string, CommandMetadataOverride> | Map<string, CommandMetadataOverride>,
): { ok: true; overrides: Record<string, CommandMetadataOverride> } | { ok: false; errors: string[] };

export declare function normalizeCommandMetadataOverridesForSave(
  catalogCommands: Array<{ name: string; payload: Record<string, unknown> }>,
  overrides?: Record<string, CommandMetadataOverride> | Map<string, CommandMetadataOverride>,
): { ok: true; overrides: Record<string, CommandMetadataOverride> } | { ok: false; errors: string[] };

export declare function applyEditableMetadataToPayload(
  basePayload: Record<string, unknown>,
  editable: EditableMetadata,
): Record<string, unknown>;
