export interface RoleGroups {
  [key: string]: string | undefined;
}

export interface PermissionsConfig {
  groups: RoleGroups;
  commands: Record<string, Array<string | undefined>>;
}

export interface LegacyConstants {
  BOT_ID: string;
  DISABLED_CHANNELS: string[];
  DISABLED_CATEGORIES: string[];
  ROLES: Record<string, string>;
  APPLICATION_CHANNEL: string;
  REVIEW_CHANNEL: string;
  HELPER: Record<string, string>;
}

export declare const permissions: PermissionsConfig;
export declare const constants: LegacyConstants;
export declare const groups: RoleGroups;
export declare const commands: Record<string, Array<string | undefined>>;
