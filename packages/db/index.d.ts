import type { Model } from "mongoose";

export declare function connectDB(): Promise<void>;

export declare const User: Model<any>;
export declare const Reputation: Model<any>;
export declare const RepBan: Model<any>;
export declare const XpBan: Model<any>;
export declare const XpFlushGrant: Model<any>;
export declare const Sticky: Model<any>;
export declare const StickyLog: Model<any>;
export declare const Poll: Model<any>;
export declare const PollVote: Model<any>;
export declare const Confession: Model<any>;
export declare const ConfessionBan: Model<any>;
export declare const ModmailTicket: Model<any>;
export declare const ModmailBan: Model<any>;
export declare const ModmailMessageLink: Model<any>;
export declare const ModDm: Model<any>;
export declare const Certificate: Model<any>;
export declare const CertRotation: Model<any>;
export declare const QotdRotation: Model<any>;
export declare const Counter: Model<any>;
export declare const ModLog: Model<any>;
export declare const Warning: Model<any>;
export declare const VerbalWarning: Model<any>;
export declare const ModPoint: Model<any>;
export declare const Note: Model<any>;
export declare const Kick: Model<any>;
export declare const Task: Model<any>;
export declare const TaskDisplay: Model<any>;
export declare const HelperRole: Model<any>;
export declare const Definition: Model<any>;
export declare const DefinitionRequest: Model<any>;
export declare const GuildConfig: Model<any>;
export declare const DashboardAccess: Model<any>;
export declare const ExamSession: Model<any>;
export declare const ExamPaper: Model<any>;
export declare const ChannelDirectory: Model<any>;
export declare const TIME_UTC_RE: RegExp;
export declare const DATE_RE: RegExp;
export declare function combineDateAndUtcTime(
  dateStr: string,
  timeUtc: string,
): Date;
export declare function computePaperWindow(
  session: {
    amStartUtc: string;
    amEndUtc: string;
    pmStartUtc: string;
    pmEndUtc: string;
  },
  paper: { date: string; slot: "AM" | "PM" },
): { lockAt: Date; unlockAt: Date };
export declare function buildDefaultGuildConfig(guildId: string): Record<string, unknown>;
export declare const DEFAULT_COMMAND_PERMISSIONS: Record<string, string[]>;
export declare const DEFAULT_COMMAND_DISCORD_PERMISSIONS: Record<string, string>;
export declare const DEFAULT_COMMAND_EPHEMERAL: Record<string, boolean>;
export declare const DEFAULT_BAN_MESSAGES: {
  appealUrl: string;
  banAppealable: string;
  banNotAppealable: string;
  appealApproved: string;
  appealRejected: string;
};
export type ModPointSource = "warn" | "timeout" | "kick" | "softban";
export type ModPointExpirySource = ModPointSource | "manual";
export type ModPointsConfig = {
  enabled: boolean;
  threshold: number;
  noticeDistance: number;
  expiryDays: Record<ModPointExpirySource, number>;
  values: Record<ModPointSource, number>;
  autoBan: {
    appealable: boolean;
    deleteMessages: string;
    reasonTemplate: string;
  };
  banNoticeTemplate: string;
  appendToInfractionDms: boolean;
  infractionDmSuffix: string;
};
export declare const DEFAULT_MOD_POINTS: ModPointsConfig;
export declare const MOD_POINT_SOURCES: ModPointSource[];
export declare const MOD_POINT_EXPIRY_SOURCES: ModPointExpirySource[];
export declare const MOD_POINT_DELETE_MESSAGE_OPTIONS: string[];
export declare function normalizeModPointsConfig(
  raw: unknown,
): { ok: true; points: ModPointsConfig } | { ok: false; errors: string[] };
export declare const DEFAULT_QOTD_REMINDER_TEMPLATE: string;
export type DefinitionSubject = {
  id: string;
  label: string;
  helperRoleKeys: string[];
  enabled: boolean;
};
export type DefinitionBoard = { id: string; label: string; enabled: boolean };
export type DefinitionsConfig = {
  subjects: DefinitionSubject[];
  boards: DefinitionBoard[];
  reviewChannelId: string;
  logChannelId: string;
  approverRoleKeys: string[];
  pingRoleKeys: string[];
  maxPendingPerUser: number;
};
export declare const DEFINITION_LIMITS: {
  term: number;
  definition: number;
  chapter: number;
  topic: number;
  note: number;
  label: number;
  maxPendingPerUser: number;
};
export declare const DEFAULT_DEFINITION_SUBJECTS: { id: string; label: string }[];
export declare const DEFAULT_DEFINITION_BOARDS: { id: string; label: string }[];
export declare function buildDefaultDefinitions(): DefinitionsConfig;
export declare function normalizeTermKey(term: string): string;
export declare function slugifyEntryId(label: string): string;
export declare function normalizeDefinitionsConfig(
  raw: unknown,
): { ok: true; definitions: DefinitionsConfig } | { ok: false; errors: string[] };
export type ExamSubject = {
  id: string;
  label: string;
  syllabusCodes: string[];
  channels: { id: string; label: string }[];
  enabled: boolean;
};
export type ExamLockingConfig = {
  subjects: ExamSubject[];
};
export declare const EXAM_LOCKING_LIMITS: {
  label: number;
  subjects: number;
  syllabusCodesPerSubject: number;
  channelsPerSubject: number;
};
export declare function buildDefaultExamLocking(): ExamLockingConfig;
export declare function normalizeExamLockingConfig(
  raw: unknown,
): { ok: true; examLocking: ExamLockingConfig } | { ok: false; errors: string[] };
export type ChannelDirectoryType =
  | "text"
  | "announcement"
  | "forum"
  | "media"
  | "voice"
  | "stage"
  | "category";
export type ChannelDirectoryEntry = {
  id: string;
  name: string;
  type: ChannelDirectoryType;
  parentId: string | null;
  position: number;
};
export declare function normalizeIdLabels(
  raw: unknown,
): { id: string; label: string }[];
export declare function normalizeReputationIdLabels(
  reputation: Record<string, unknown> | null | undefined,
): Record<string, unknown>;
export declare function normalizeRanksIdLabels(
  ranks: Record<string, unknown> | null | undefined,
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
