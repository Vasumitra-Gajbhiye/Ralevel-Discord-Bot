import "server-only";

import {
  connectDB,
  User,
  Reputation,
  RepBan,
  Sticky,
  StickyLog,
  Poll,
  PollVote,
  Confession,
  ConfessionBan,
  Certificate,
  QotdRotation,
  Counter,
  ModLog,
  Warning,
  Note,
  Kick,
  Task,
  TaskDisplay,
  HelperRole,
  GuildConfig,
  buildDefaultGuildConfig,
  DEFAULT_COMMAND_PERMISSIONS,
} from "@ralevel/db";

let connected = false;

/**
 * Ensures a single shared MongoDB connection for Next.js server code.
 */
export async function ensureDb() {
  if (!connected) {
    await connectDB();
    connected = true;
  }
  return {
    User,
    Reputation,
    RepBan,
    Sticky,
    StickyLog,
    Poll,
    PollVote,
    Confession,
    ConfessionBan,
    Certificate,
    QotdRotation,
    Counter,
    ModLog,
    Warning,
    Note,
    Kick,
    Task,
    TaskDisplay,
    HelperRole,
    GuildConfig,
    buildDefaultGuildConfig,
    DEFAULT_COMMAND_PERMISSIONS,
  };
}

export async function getOrCreateGuildConfig() {
  const { GuildConfig, buildDefaultGuildConfig } = await ensureDb();
  const guildId = process.env.GUILD_ID;
  if (!guildId) {
    throw new Error("GUILD_ID is not set");
  }
  let doc = await GuildConfig.findOne({ guildId });
  if (!doc) {
    doc = await GuildConfig.create(buildDefaultGuildConfig(guildId));
  }
  return doc;
}

export function guildConfigToJson(doc: {
  toObject?: () => Record<string, unknown>;
  commandPermissions?: Map<string, string[]> | Record<string, string[]>;
  [key: string]: unknown;
}) {
  const obj =
    typeof doc.toObject === "function"
      ? doc.toObject()
      : ({ ...doc } as Record<string, unknown>);
  if (obj.commandPermissions instanceof Map) {
    obj.commandPermissions = Object.fromEntries(obj.commandPermissions);
  }
  return obj;
}

export {
  connectDB,
  User,
  Reputation,
  RepBan,
  Sticky,
  StickyLog,
  Poll,
  PollVote,
  Confession,
  ConfessionBan,
  Certificate,
  QotdRotation,
  Counter,
  ModLog,
  Warning,
  Note,
  Kick,
  Task,
  TaskDisplay,
  HelperRole,
  GuildConfig,
  buildDefaultGuildConfig,
  DEFAULT_COMMAND_PERMISSIONS,
};
