require("dotenv").config();

// 1. Define your role groups
// Using arrays makes it easy to combine them later
const groups = {
  //   mod: process.env.MOD_ROLES ? process.env.MOD_ROLES.split(",") : [],
  admin: process.env.ADMIN_ROLE_ID,
  gfxHead: process.env.GFX_HEAD_ROLE_ID,
  dcHead: process.env.DC_HEAD_ROLE_ID,
  rdtHead: process.env.RDT_HEAD_ROLE_ID,
  hlpHead: process.env.HLP_HEAD_ROLE_ID,
  commHead: process.env.COMM_HEAD_ROLE_ID,
  generalStaff: process.env.GENERAL_STAFF_ROLE_ID,
  srMods: process.env.SR_MOD_ROLE_ID,
  jrMods: process.env.JR_MOD_ROLE_ID,
  trialMods: process.env.TRIAL_MOD_ROLE_ID,
  redditMods: process.env.REDDIT_MOD_ROLE_ID,
  srHelper: process.env.SR_HELPER_ROLE_ID,
  jrHelper: process.env.JR_HELPER_ROLE_ID,
  leadDesigner: process.env.LEAD_DESIGNER_ROLE_ID,
  designer: process.env.DESIGNER_ROLE_ID,
  trialDesigner: process.env.TRIAL_DESIGNER_ROLE_ID,
  resourceContributor: process.env.RESOURCE_CONTRIBUTOR_ROLE_ID,
  EngagementCoordinator: process.env.ENGAGEMENT_COORDINATOR_ROLE_ID,
  EngagementSpecialist: process.env.ENGAGEMENT_SPECIALIST_ROLE_ID,
  EngagementTrial: process.env.ENGAGEMENT_TRIAL_ROLE_ID,
  ialAgent: process.env.IAL_AGENT_ROLE_ID,
  internalAffairAndLogistics: process.env.INTERNAL_AFFAIR_AND_LOGISTICS_ROLE_ID,
  writer: process.env.WRITER_ROLE_ID,
  booster: process.env.BOOSTER_ROLE_ID,
  beginner: process.env.BEGINNER_ROLE_ID,
  intermediate: process.env.INTERMEDIATE_ROLE_ID,
  advanced: process.env.ADVANCED_ROLE_ID,
  expert: process.env.EXPERT_ROLE_ID,
  gigachad: process.env.GIGACHAD_ROLE_ID,
};

const {
  admin,
  gfxHead,
  dcHead,
  rdtHead,
  hlpHead,
  commHead,
  generalStaff,
  srMods,
  jrMods,
  trialMods,
  redditMods,
  srHelper,
  jrHelper,
  leadDesigner,
  designer,
  trialDesigner,
  resourceContributor,
  EngagementCoordinator,
  EngagementSpecialist,
  EngagementTrial,
  ialAgent,
  internalAffairAndLogistics,
  writer,
  booster,
  beginner,
  intermediate,
  advanced,
  expert,
  gigachad,
} = groups;

// 2. Map command names (the setName property) to allowed roles
const commands = {
  // MODERATION COMMANDS
  "add-role": [admin, dcHead, generalStaff],
  announce: [admin, generalStaff],
  audit: [admin, generalStaff], //yellow
  ban: [admin, dcHead, srMods, jrMods],
  "ban-appeal-approved": [admin, dcHead], // yellow
  "ban-appeal-rejected": [admin, dcHead], // yellow
  "clear-warnings": [admin, dcHead],
  "delete-warning": [admin, dcHead, srMods],
  kick: [admin, dcHead],
  "lock-status": [admin, dcHead, srMods, jrMods],
  lock: [admin, dcHead, srMods, jrMods],
  "moderator-logs": [admin, dcHead, srMods, ialAgent],
  "moderation-logs": [admin, dcHead, srMods, jrMods, trialMods, ialAgent],
  note: [admin, dcHead, srMods, jrMods, trialMods],
  "get-notes": [admin, dcHead, srMods, jrMods, trialMods],
  pin: [admin, dcHead, srMods],
  poll: [admin, dcHead, srMods, jrMods, trialMods],
  purge: [admin, dcHead, srMods],
  "remove-role": [admin, dcHead, generalStaff],
  say: [admin, dcHead, srMods, jrMods],
  "set-nickname": [admin, dcHead, srMods, ialAgent],
  slowmode: [admin, dcHead, srMods],
  "timeout-status": [admin, dcHead, srMods],
  timeout: [admin, dcHead, srMods, jrMods, trialMods],
  unban: [admin, dcHead],
  unlock: [admin, dcHead, srMods, jrMods],
  unpin: [admin, dcHead, srMods],
  untimeout: [admin, dcHead, srMods, trialMods, jrMods],
  warn: [admin, dcHead, srMods, jrMods, trialMods],
  warnings: [admin, dcHead, srMods, jrMods, trialMods],
  poll: [admin, dcHead, generalStaff, srMods, jrMods, trialMods],

  // APPLICATIONS COMMANDS

  // CERTIFICATEES COMMANDS
  "approve-certificate": [admin],
  "certificate-status-mod": [admin],
  "certificate-status": [admin],
  "mark-cert-delivered": [admin],
  "reject-certificate": [admin],
  "send-cert-msg": [admin],
  "submit-cert-details": [admin],

  // CONFESSION COMMANDS
  // FUN COMMANDS
  // ping: [], // everyone

  // HELPER COMMANDS

  // REPUTATION COMMANDS
  "add-rep": [hlpHead, admin],
  "list-rep-ban": [admin, dcHead, hlpHead, srHelper, jrMods], //yellow
  "rep-ban": [admin, dcHead, hlpHead, srMods], //yellow
  "rep-unban": [admin, dcHead, hlpHead, srMods], //yellow
  "set-rep": [hlpHead, admin],
  "sub-rep": [hlpHead, admin],

  // SECOND WEB COMMANDS

  // SETHELPER COMMANDS
  "set-helper": [admin, hlpHead, dcHead],

  // STICKY
  "add-sticky": [admin, dcHead, srMods, jrMods],
  "edit-sticky": [admin, dcHead, srMods],
  "remove-sticky": [admin, dcHead, srMods],
  "sticky-list": [admin, dcHead, srMods],
  "sticky-log": [admin, dcHead],
  "sticky-resend": [admin, dcHead, srMods],

  // TASK COMMANDS
  "add-task": [admin, gfxHead],
  claim: [admin, gfxHead, designer, trialDesigner],
  "edit-task": [admin, gfxHead],
  "finished-tsk": [admin, gfxHead, designer, trialDesigner],
  "mark-tsk-done": [admin, gfxHead],
  "my-progress": [admin, gfxHead, designer, trialDesigner],
  mytasks: [admin, gfxHead, designer, trialDesigner],
  tasks: [admin, gfxHead],

  // UTILITY COMMANDS

  // WEB COMMANDS

  // Example of combining multiple groups:
  // "nickname": [...groups.mod, ...groups.admin, ...groups.helper],
  // NOTE: Any command name NOT listed in this object will be accessible to everyone.
};

module.exports = {
  groups,
  commands,
};
