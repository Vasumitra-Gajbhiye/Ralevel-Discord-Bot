const mongoose = require("mongoose");

const RoleEntrySchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    roleId: { type: String, default: "" },
  },
  { _id: false },
);

const ChannelEntrySchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    label: { type: String, default: "" },
    channelId: { type: String, default: "" },
  },
  { _id: false },
);

const CategoryEntrySchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    label: { type: String, default: "" },
    categoryId: { type: String, default: "" },
  },
  { _id: false },
);

const RepTierSchema = new mongoose.Schema(
  {
    roleKey: { type: String, required: true },
    threshold: { type: Number, required: true },
    label: { type: String, default: "" },
  },
  { _id: false },
);

const IdLabelSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    label: { type: String, default: "" },
  },
  { _id: false },
);

const RankEntrySchema = new mongoose.Schema(
  {
    roleId: { type: String, required: true },
    xp: { type: Number, required: true },
    name: { type: String, default: "" },
  },
  { _id: false },
);

const CertTypeSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    label: { type: String, required: true },
    enabled: { type: Boolean, default: true },
    requiredRoleKeys: { type: [String], default: [] },
    rewardRoleKey: { type: String, default: null },
  },
  { _id: false },
);

const TaskTeamSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    label: { type: String, required: true },
    channelKey: { type: String, required: true },
    allowedRoleKeys: { type: [String], default: [] },
  },
  { _id: false },
);

const GuildConfigSchema = new mongoose.Schema(
  {
    guildId: { type: String, required: true, unique: true, index: true },
    roles: { type: [RoleEntrySchema], default: [] },
    // Map of commandName -> array of role keys
    commandPermissions: { type: Map, of: [String], default: {} },
    channels: { type: [ChannelEntrySchema], default: [] },
    categories: { type: [CategoryEntrySchema], default: [] },
    features: {
      reputation: { type: Boolean, default: true },
      sticky: { type: Boolean, default: true },
      certificates: { type: Boolean, default: true },
      confessions: { type: Boolean, default: true },
      tasks: { type: Boolean, default: true },
      polls: { type: Boolean, default: true },
      welcome: { type: Boolean, default: true },
      qotd: { type: Boolean, default: true },
      xpRanks: { type: Boolean, default: true },
    },
    reputation: {
      tiers: { type: [RepTierSchema], default: [] },
      thankWords: { type: [String], default: [] },
      welcomeWords: { type: [String], default: [] },
      disabledChannels: { type: [IdLabelSchema], default: [] },
      disabledCategories: { type: [IdLabelSchema], default: [] },
      staffChannelIds: { type: [IdLabelSchema], default: [] },
    },
    ranks: {
      ladder: { type: [RankEntrySchema], default: [] },
      levelUpChannelKey: { type: String, default: "levelUp" },
      boosterRoleKey: { type: String, default: "booster" },
      boosterMultiplier: { type: Number, default: 2 },
    },
    schedules: {
      finalizeHourIst: { type: Number, default: 6 },
      qotdHourIst: { type: Number, default: 6 },
    },
    welcome: {
      title: { type: String, default: "Welcome to r/alevel 👋" },
      description: {
        type: String,
        default:
          "<@{userId}> has joined the community!\n\nSelect/edit your subject roles from **Channels & Roles** to access subject channels and resources!",
      },
      color: { type: String, default: "#2CDAF2" },
      avatarSize: { type: Number, default: 360 },
      avatarX: { type: Number, default: 600 },
      avatarY: { type: Number, default: 225 },
    },
    certificates: {
      types: { type: [CertTypeSchema], default: [] },
      modRoleKeys: { type: [String], default: ["admin"] },
      /** Extra Discord role IDs (legacy MOD_ROLES) beyond named keys */
      extraModRoleIds: { type: [String], default: [] },
    },
    confessions: {
      modChannelKey: { type: String, default: "modAction" },
      ventChannelKey: { type: String, default: "vent" },
      approverRoleKeys: { type: [String], default: ["admin", "dcHead", "srMods"] },
    },
    tasks: {
      teams: { type: [TaskTeamSchema], default: [] },
    },
    polls: {
      breakdownRoleKeys: {
        type: [String],
        default: ["admin", "dcHead", "srMods", "jrMods"],
      },
      minOptions: { type: Number, default: 2 },
      maxOptions: { type: Number, default: 24 },
    },
    sticky: {
      defaultLineThreshold: { type: Number, default: 8 },
    },
    helper: {
      pingDelayMs: { type: Number, default: 10000 },
    },
  },
  { timestamps: true },
);

module.exports = mongoose.models["GuildConfig"] || mongoose.model("GuildConfig", GuildConfigSchema);
