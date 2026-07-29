import "server-only";

import {
  connectDB,
  User,
  Reputation,
  RepBan,
  XpBan,
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
  DashboardAccess,
  buildDefaultGuildConfig,
  DEFAULT_COMMAND_PERMISSIONS,
  migrateGuildConfigDocument,
  migrateGuildConfigInPlace,
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
    XpBan,
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
    DashboardAccess,
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

  await migrateGuildConfigDocument(GuildConfig, guildId);

  let doc = await GuildConfig.findOne({ guildId });
  if (!doc) {
    doc = await GuildConfig.create(buildDefaultGuildConfig(guildId));
  }
  return doc;
}

export function guildConfigToJson(doc: {
  toObject?: () => Record<string, unknown>;
  commandPermissions?: Map<string, string[]> | Record<string, string[]>;
  commandDiscordPermissions?: Map<string, string> | Record<string, string>;
  commandDisplayNames?: Map<string, string> | Record<string, string>;
  commandMetadataOverrides?: Map<string, unknown> | Record<string, unknown>;
  [key: string]: unknown;
}) {
  const obj =
    typeof doc.toObject === "function"
      ? doc.toObject()
      : ({ ...doc } as Record<string, unknown>);
  if (obj.commandPermissions instanceof Map) {
    obj.commandPermissions = Object.fromEntries(obj.commandPermissions);
  }
  if (obj.commandDiscordPermissions instanceof Map) {
    obj.commandDiscordPermissions = Object.fromEntries(obj.commandDiscordPermissions);
  }
  if (obj.commandDisplayNames instanceof Map) {
    obj.commandDisplayNames = Object.fromEntries(obj.commandDisplayNames);
  }
  if (obj.commandMetadataOverrides instanceof Map) {
    obj.commandMetadataOverrides = Object.fromEntries(obj.commandMetadataOverrides);
  }
  return obj;
}

export {
  connectDB,
  User,
  Reputation,
  RepBan,
  XpBan,
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
  DashboardAccess,
  buildDefaultGuildConfig,
  DEFAULT_COMMAND_PERMISSIONS,
  migrateGuildConfigDocument,
  migrateGuildConfigInPlace,
};
