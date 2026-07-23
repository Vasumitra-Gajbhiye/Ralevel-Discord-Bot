import type { Model } from "mongoose";

export declare function connectDB(): Promise<void>;

export declare const User: Model<any>;
export declare const Reputation: Model<any>;
export declare const RepBan: Model<any>;
export declare const Sticky: Model<any>;
export declare const StickyLog: Model<any>;
export declare const Poll: Model<any>;
export declare const PollVote: Model<any>;
export declare const Confession: Model<any>;
export declare const ConfessionBan: Model<any>;
export declare const Certificate: Model<any>;
export declare const QotdRotation: Model<any>;
export declare const Counter: Model<any>;
export declare const ModLog: Model<any>;
export declare const Warning: Model<any>;
export declare const Note: Model<any>;
export declare const Kick: Model<any>;
export declare const Task: Model<any>;
export declare const TaskDisplay: Model<any>;
export declare const HelperRole: Model<any>;
export declare const GuildConfig: Model<any>;
export declare const DashboardAccess: Model<any>;
export declare function buildDefaultGuildConfig(guildId: string): Record<string, unknown>;
export declare const DEFAULT_COMMAND_PERMISSIONS: Record<string, string[]>;
export declare function normalizeIdLabels(
  raw: unknown,
): { id: string; label: string }[];
export declare function normalizeReputationIdLabels(
  reputation: Record<string, unknown> | null | undefined,
): Record<string, unknown>;
export declare function migrateRankLadder(
  roles: { key: string; label: string; roleId: string }[] | null | undefined,
  ladder: unknown,
): {
  roles: { key: string; label: string; roleId: string }[];
  ladder: { roleKey: string; xp: number; name: string }[];
};
export declare function normalizeRanksConfig(
  roles: { key: string; label: string; roleId: string }[] | null | undefined,
  ranks: Record<string, unknown> | null | undefined,
): {
  roles: { key: string; label: string; roleId: string }[];
  ranks: Record<string, unknown>;
};
export declare function migrateGuildConfigDocument(
  GuildConfig: { collection: { findOne: (query: object) => Promise<Record<string, unknown> | null>; updateOne: (query: object, update: object) => Promise<unknown> } },
  guildId: string,
): Promise<boolean>;
export declare function migrateGuildConfigInPlace(doc: {
  channels?: unknown;
  channelLabels?: Record<string, string>;
  categories?: unknown;
  markModified: (path: string) => void;
}): boolean;
