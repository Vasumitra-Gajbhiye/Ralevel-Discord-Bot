/**
 * Builds a default GuildConfig plain object from process.env.
 * Used by seed script and bot bootstrap when no document exists.
 */

const ROLE_DEFS = [
  { key: "admin", label: "Admin", env: "ADMIN_ROLE_ID" },
  { key: "gfxHead", label: "GFX Head", env: "GFX_HEAD_ROLE_ID" },
  { key: "dcHead", label: "DC Head", env: "DC_HEAD_ROLE_ID" },
  { key: "rdtHead", label: "Reddit Head", env: "RDT_HEAD_ROLE_ID" },
  { key: "hlpHead", label: "Helper Head", env: "HLP_HEAD_ROLE_ID" },
  { key: "commHead", label: "Community Head", env: "COMM_HEAD_ROLE_ID" },
  { key: "generalStaff", label: "General Staff", env: "GENERAL_STAFF_ROLE_ID" },
  { key: "srMods", label: "Senior Mod", env: "SR_MOD_ROLE_ID" },
  { key: "jrMods", label: "Junior Mod", env: "JR_MOD_ROLE_ID" },
  { key: "trialMods", label: "Trial Mod", env: "TRIAL_MOD_ROLE_ID" },
  { key: "redditMods", label: "Reddit Mod", env: "REDDIT_MOD_ROLE_ID" },
  { key: "srHelper", label: "Senior Helper", env: "SR_HELPER_ROLE_ID" },
  { key: "jrHelper", label: "Junior Helper", env: "JR_HELPER_ROLE_ID" },
  { key: "leadDesigner", label: "Lead Designer", env: "LEAD_DESIGNER_ROLE_ID" },
  { key: "designer", label: "Designer", env: "DESIGNER_ROLE_ID" },
  { key: "trialDesigner", label: "Trial Designer", env: "TRIAL_DESIGNER_ROLE_ID" },
  {
    key: "resourceContributor",
    label: "Resource Contributor",
    env: "RESOURCE_CONTRIBUTOR_ROLE_ID",
  },
  {
    key: "EngagementCoordinator",
    label: "Engagement Coordinator",
    env: "ENGAGEMENT_COORDINATOR_ROLE_ID",
  },
  {
    key: "EngagementSpecialist",
    label: "Engagement Specialist",
    env: "ENGAGEMENT_SPECIALIST_ROLE_ID",
  },
  {
    key: "EngagementTrial",
    label: "Engagement Trial",
    env: "ENGAGEMENT_TRIAL_ROLE_ID",
  },
  { key: "ialAgent", label: "IAL Agent", env: "IAL_AGENT_ROLE_ID" },
  {
    key: "internalAffairAndLogistics",
    label: "Internal Affairs & Logistics",
    env: "INTERNAL_AFFAIR_AND_LOGISTICS_ROLE_ID",
  },
  { key: "writer", label: "Writer", env: "WRITER_ROLE_ID" },
  { key: "booster", label: "Booster", env: "BOOSTER_ROLE_ID" },
  {
    key: "beginner",
    label: "Beginner (rep)",
    env: "ROLE_BEGINNER_ROLE_ID",
    fallbackEnv: "BEGINNER_ROLE_ID",
  },
  { key: "intermediate", label: "Intermediate (rep)", env: "INTERMEDIATE_ROLE_ID" },
  { key: "advanced", label: "Advanced (rep)", env: "ADVANCED_ROLE_ID" },
  { key: "expert", label: "Expert (rep)", env: "EXPERT_ROLE_ID" },
  { key: "gigachad", label: "Giga Chad (rep)", env: "GIGACHAD_ROLE_ID" },
];

const DEFAULT_THANK_WORDS = [
  "thanks!!",
  "thank you",
  "thank u",
  "thankuu",
  "thankuuu",
  "thankyou",
  "thanks",
  "thanks!",
  "thankss",
  "thankss!",
  "thankss!!",
  "thanksss",
  "ty",
  "tysm",
  "tyvm",
  "thx",
  "thanx",
  "thnx",
  "tnx",
  "tnx!",
  "thnk u",
  "thank you very much",
  "thank you so much",
  "thanks a lot",
  "thanks a ton",
  "many thanks",
  "appreciate it",
  "much appreciated",
  "really appreciate it",
  "appreciate ya",
  "i appreciate it",
  "tyty",
  "tytyy",
  "tyy",
  "tyuu",
  "tyssm",
  "tysmmm",
  "tysmm",
  "tysmmm!!!",
  "thxsm",
  "ty <3",
  "tysm <3",
  "thank yoi",
  "thank uo",
  "thakns",
  "thansk",
  "tahnks",
  "tahnx",
  "tnk u",
  "tyu",
  "tyyyy",
  "tyuy",
  "ty!!",
  "tysm!!",
  "thx!!",
  "thank you!!!",
  "tyyy!!!",
  "ty :D",
  "tysm :)",
  "ty <33",
  "tysmmm <333",
];

const DEFAULT_WELCOME_WORDS = [
  "yw",
  "welcome",
  "np",
  "noworries",
  "noproblem",
  "nw",
  "nws",
];

/** Production XP rank ladder (roleId + xp threshold + display name). */
const DEFAULT_RANK_LADDER = [
  { roleId: "1487405095627915315", xp: 0, name: "" },
  { roleId: "1487405099440668782", xp: 20, name: "" },
  { roleId: "1487405103244644404", xp: 100, name: "" },
  { roleId: "1487405107929813052", xp: 250, name: "" },
  { roleId: "1487405111935238266", xp: 500, name: "" },
  { roleId: "1487405115735281744", xp: 1000, name: "" },
  { roleId: "1487405119527059486", xp: 2500, name: "" },
  { roleId: "1487405123058536642", xp: 5000, name: "" },
  { roleId: "1487405128641282048", xp: 10000, name: "" },
  { roleId: "1487405132911214614", xp: 15000, name: "" },
  { roleId: "1487405136757395547", xp: 20000, name: "" },
  { roleId: "1487405140897173536", xp: 30000, name: "" },
  { roleId: "1487405144852140123", xp: 50000, name: "" },
  { roleId: "1487405149184852068", xp: 75000, name: "" },
  { roleId: "1487405153207189605", xp: 100000, name: "" },
];

/**
 * Command name -> role keys. Fixed mismatches from legacy permissions.js:
 * setnickname (was set-nickname), sethelper (was set-helper), softban added.
 */
const DEFAULT_COMMAND_PERMISSIONS = {
  "add-role": ["admin", "dcHead", "generalStaff"],
  announce: ["admin", "generalStaff"],
  audit: ["admin", "generalStaff"],
  ban: ["admin", "dcHead", "srMods", "jrMods"],
  "ban-appeal-approved": ["admin", "dcHead"],
  "ban-appeal-rejected": ["admin", "dcHead"],
  "clear-warnings": ["admin", "dcHead"],
  "delete-warning": ["admin", "dcHead", "srMods"],
  kick: ["admin", "dcHead"],
  "lock-status": ["admin", "dcHead", "srMods", "jrMods"],
  lock: ["admin", "dcHead", "srMods", "jrMods"],
  "moderator-logs": ["admin", "dcHead", "srMods", "ialAgent"],
  "moderation-logs": [
    "admin",
    "dcHead",
    "srMods",
    "jrMods",
    "trialMods",
    "ialAgent",
  ],
  note: ["admin", "dcHead", "srMods", "jrMods", "trialMods"],
  "get-notes": ["admin", "dcHead", "srMods", "jrMods", "trialMods"],
  pin: ["admin", "dcHead", "srMods"],
  purge: ["admin", "dcHead", "srMods"],
  "remove-role": ["admin", "dcHead", "generalStaff"],
  say: ["admin", "dcHead", "srMods", "jrMods"],
  setnickname: ["admin", "dcHead", "srMods", "ialAgent"],
  slowmode: ["admin", "dcHead", "srMods"],
  softban: ["admin", "dcHead", "srMods", "jrMods"],
  "timeout-status": ["admin", "dcHead", "srMods"],
  timeout: ["admin", "dcHead", "srMods", "jrMods", "trialMods"],
  unban: ["admin", "dcHead"],
  unlock: ["admin", "dcHead", "srMods", "jrMods"],
  unpin: ["admin", "dcHead", "srMods"],
  untimeout: ["admin", "dcHead", "srMods", "trialMods", "jrMods"],
  warn: ["admin", "dcHead", "srMods", "jrMods", "trialMods"],
  warnings: ["admin", "dcHead", "srMods", "jrMods", "trialMods"],
  poll: ["admin", "dcHead", "generalStaff", "srMods", "jrMods", "trialMods"],
  "qotd-status": ["admin", "dcHead", "srMods", "jrMods"],
  "approve-certificate": ["admin"],
  "certificate-status-mod": ["admin"],
  "certificate-status": ["admin"],
  "mark-cert-delivered": ["admin"],
  "reject-certificate": ["admin"],
  "send-cert-msg": ["admin"],
  "submit-cert-details": ["admin"],
  "add-rep": ["hlpHead", "admin"],
  "list-rep-ban": ["admin", "dcHead", "hlpHead", "srHelper", "jrMods"],
  "rep-ban": ["admin", "dcHead", "hlpHead", "srMods"],
  "rep-unban": ["admin", "dcHead", "hlpHead", "srMods"],
  "set-rep": ["hlpHead", "admin"],
  "sub-rep": ["hlpHead", "admin"],
  sethelper: ["admin", "hlpHead", "dcHead"],
  "add-sticky": ["admin", "dcHead", "srMods", "jrMods"],
  "edit-sticky": ["admin", "dcHead", "srMods"],
  "remove-sticky": ["admin", "dcHead", "srMods"],
  "sticky-list": ["admin", "dcHead", "srMods"],
  "sticky-log": ["admin", "dcHead"],
  "sticky-resend": ["admin", "dcHead", "srMods"],
  "add-task": ["admin", "gfxHead"],
  claim: ["admin", "gfxHead", "designer", "trialDesigner"],
  "edit-task": ["admin", "gfxHead"],
  "finished-tsk": ["admin", "gfxHead", "designer", "trialDesigner"],
  "mark-tsk-done": ["admin", "gfxHead"],
  "my-progress": ["admin", "gfxHead", "designer", "trialDesigner"],
  mytasks: ["admin", "gfxHead", "designer", "trialDesigner"],
  tasks: ["admin", "gfxHead"],
};

function parseJsonIdList(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch {
    // fall through — treat as comma-separated
  }
  return String(raw)
    .split(",")
    .map((s) => s.trim().replace(/^\[|\]$/g, "").replace(/^"|"$/g, ""))
    .filter(Boolean);
}

function env(name, fallback = "") {
  return process.env[name] || fallback;
}

function buildDefaultGuildConfig(guildId) {
  const roles = ROLE_DEFS.map(({ key, label, env: envName, fallbackEnv }) => ({
    key,
    label,
    roleId: env(envName) || (fallbackEnv ? env(fallbackEnv) : "") || "",
  }));

  const extraModRoleIds = String(env("MOD_ROLES"))
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    guildId: String(guildId),
    roles,
    commandPermissions: { ...DEFAULT_COMMAND_PERMISSIONS },
    channels: {
      application: env("APPLICATION_CHANNEL"),
      review: env("REVIEW_CHANNEL"),
      certUpdates: env("CERT_UPDATES_CHANNEL"),
      graphic: env("GRAPHIC_CHANNEL"),
      dev: env("DEV_CHANNEL"),
      writer: env("WRITER_CHANNEL"),
      welcome: env("WELCOME_CHANNEL"),
      modAction: env("MOD_ACTION_CHANNEL"),
      vent: env("VENT_CHANNEL"),
      modLog: env("MOD_LOG_CHANNEL_ID"),
      levelUp: env("LEVELUP_CHANNEL_ID"),
      qotdReminder: env("QOTD_REMINDER_CHANNEL_ID"),
    },
    channelLabels: {
      application: "",
      review: "",
      certUpdates: "",
      graphic: "",
      dev: "",
      writer: "",
      welcome: "",
      modAction: "",
      vent: "",
      modLog: "",
      levelUp: "",
      qotdReminder: "",
    },
    features: {
      reputation: true,
      sticky: true,
      certificates: true,
      confessions: true,
      tasks: true,
      polls: true,
      welcome: true,
      qotd: true,
      xpRanks: true,
    },
    reputation: {
      tiers: [
        { roleKey: "gigachad", threshold: 1000, label: "Giga Chad (1000+ Rep)" },
        { roleKey: "expert", threshold: 500, label: "Expert (500+ Rep)" },
        { roleKey: "advanced", threshold: 100, label: "Advanced (100+ Rep)" },
        {
          roleKey: "intermediate",
          threshold: 50,
          label: "Intermediate (50+ Rep)",
        },
        { roleKey: "beginner", threshold: 10, label: "Beginner (10+ Rep)" },
      ],
      thankWords: [...DEFAULT_THANK_WORDS],
      welcomeWords: [...DEFAULT_WELCOME_WORDS],
      disabledChannels: parseJsonIdList(env("DISABLED_CHANNELS")),
      disabledCategories: parseJsonIdList(env("DISABLED_CATEGORIES")),
      staffChannelIds: String(env("STAFF_CHANNEL_IDS"))
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    },
    ranks: {
      ladder: DEFAULT_RANK_LADDER.map((r) => ({ ...r })),
      levelUpChannelKey: "levelUp",
      boosterRoleKey: "booster",
      boosterMultiplier: 2,
    },
    schedules: {
      finalizeHourIst: 6,
      qotdHourIst: 6,
    },
    welcome: {
      title: "Welcome to r/alevel 👋",
      description:
        "<@{userId}> has joined the community!\n\nSelect/edit your subject roles from **Channels & Roles** to access subject channels and resources!",
      color: "#2CDAF2",
      avatarSize: 360,
      avatarX: 600,
      avatarY: 225,
    },
    certificates: {
      types: [
        {
          id: "helper",
          label: "Helper",
          enabled: true,
          requiredRoleKeys: ["srHelper"],
          rewardRoleKey: null,
        },
        {
          id: "writer",
          label: "Writer",
          enabled: true,
          requiredRoleKeys: [],
          rewardRoleKey: null,
        },
        {
          id: "graphic",
          label: "Graphic",
          enabled: true,
          requiredRoleKeys: [],
          rewardRoleKey: null,
        },
        {
          id: "resource",
          label: "Resource Contributor",
          enabled: true,
          requiredRoleKeys: [],
          rewardRoleKey: "resourceContributor",
        },
      ],
      modRoleKeys: ["admin"],
      extraModRoleIds,
    },
    confessions: {
      modChannelKey: "modAction",
      ventChannelKey: "vent",
      approverRoleKeys: ["admin", "dcHead", "srMods"],
    },
    tasks: {
      teams: [
        {
          id: "graphic",
          label: "Graphic",
          channelKey: "graphic",
          allowedRoleKeys: ["admin", "gfxHead", "designer", "trialDesigner"],
        },
        {
          id: "dev",
          label: "Dev",
          channelKey: "dev",
          allowedRoleKeys: ["admin", "gfxHead", "designer", "trialDesigner"],
        },
        {
          id: "writer",
          label: "Writer",
          channelKey: "writer",
          allowedRoleKeys: ["admin", "gfxHead", "designer", "trialDesigner"],
        },
      ],
    },
    polls: {
      breakdownRoleKeys: ["admin", "dcHead", "srMods", "jrMods"],
      minOptions: 2,
      maxOptions: 24,
    },
    sticky: {
      defaultLineThreshold: 8,
    },
    helper: {
      pingDelayMs: 10000,
    },
  };
}

module.exports = {
  buildDefaultGuildConfig,
  DEFAULT_COMMAND_PERMISSIONS,
  DEFAULT_THANK_WORDS,
  DEFAULT_WELCOME_WORDS,
  DEFAULT_RANK_LADDER,
  ROLE_DEFS,
};
