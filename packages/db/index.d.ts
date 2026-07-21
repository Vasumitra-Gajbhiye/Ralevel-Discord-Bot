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
