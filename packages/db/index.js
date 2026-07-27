const connectDB = require("./src/database");

const User = require("./src/models/User");
const Reputation = require("./src/models/reputation");
const RepBan = require("./src/models/repban");
const XpBan = require("./src/models/xpban");
const XpFlushGrant = require("./src/models/xpFlushGrant");
const Sticky = require("./src/models/sticky");
const StickyLog = require("./src/models/stickyLog");
const Poll = require("./src/models/poll");
const PollVote = require("./src/models/pollVote");
const Confession = require("./src/models/confession");
const ConfessionBan = require("./src/models/confessionBan");
const Certificate = require("./src/models/certificate");
const QotdRotation = require("./src/models/qotdRotation");
const Counter = require("./src/models/counter");
const ModLog = require("./src/models/modlog");
const Warning = require("./src/models/warning");
const Note = require("./src/models/note");
const Kick = require("./src/models/kick");
const Task = require("./src/models/task");
const TaskDisplay = require("./src/models/taskDisplay");
const HelperRole = require("./src/models/helperRole");
const GuildConfig = require("./src/models/guildConfig");
const DashboardAccess = require("./src/models/dashboardAccess");
const {
  buildDefaultGuildConfig,
  buildDefaultCertPanel,
  DEFAULT_COMMAND_PERMISSIONS,
  DEFAULT_COMMAND_DISCORD_PERMISSIONS,
  DEFAULT_BAN_MESSAGES,
} = require("./src/defaultGuildConfig");
const {
  migrateGuildConfigDocument,
  migrateGuildConfigInPlace,
  normalizeIdLabels,
  normalizeReputationIdLabels,
  normalizeRanksIdLabels,
  migrateRankLadder,
  normalizeRanksConfig,
} = require("./src/migrateGuildConfig");

module.exports = {
  connectDB,
  User,
  Reputation,
  RepBan,
  XpBan,
  XpFlushGrant,
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
  buildDefaultCertPanel,
  DEFAULT_COMMAND_PERMISSIONS,
  DEFAULT_COMMAND_DISCORD_PERMISSIONS,
  DEFAULT_BAN_MESSAGES,
  migrateGuildConfigDocument,
  migrateGuildConfigInPlace,
  normalizeIdLabels,
  normalizeReputationIdLabels,
  normalizeRanksIdLabels,
  migrateRankLadder,
  normalizeRanksConfig,
};
