const {
  ApplicationFlags,
  GatewayCloseCodes,
  GatewayIntentBits,
  REST,
  Routes,
} = require("discord.js");

// PRIVILEGED_INTENTS controls the Server Members + Message Content intents:
//   auto  (default) — request only what Discord has granted this application
//   true            — always request both (login fails with 4014 if not granted)
//   false           — never request them; dependent features degrade
const MODES = new Set(["auto", "true", "false"]);

const BASE_INTENTS = [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.DirectMessages,
];

function getMode(raw = process.env.PRIVILEGED_INTENTS) {
  const mode = String(raw ?? "").trim().toLowerCase() || "auto";
  if (MODES.has(mode)) return mode;
  console.warn(`[intents] Unknown PRIVILEGED_INTENTS="${raw}", using "auto".`);
  return "auto";
}

function grantedFromFlags(flags) {
  const value = Number(flags) || 0;
  const hasAny = (...bits) => bits.some((bit) => (value & bit) === bit);
  return {
    members: hasAny(
      ApplicationFlags.GatewayGuildMembers,
      ApplicationFlags.GatewayGuildMembersLimited
    ),
    messageContent: hasAny(
      ApplicationFlags.GatewayMessageContent,
      ApplicationFlags.GatewayMessageContentLimited
    ),
  };
}

function buildIntents(granted) {
  const intents = [...BASE_INTENTS];
  if (granted.members) intents.push(GatewayIntentBits.GuildMembers);
  if (granted.messageContent) intents.push(GatewayIntentBits.MessageContent);
  return intents;
}

async function fetchApplicationFlags(token) {
  const rest = new REST({ version: "10" }).setToken(token);
  const app = await rest.get(Routes.currentApplication());
  return app?.flags;
}

async function resolveIntents({
  mode = getMode(),
  token = process.env.TOKEN,
  fetchFlags = fetchApplicationFlags,
} = {}) {
  let granted;
  if (mode === "true") {
    granted = { members: true, messageContent: true };
  } else if (mode === "false") {
    granted = { members: false, messageContent: false };
  } else {
    try {
      granted = grantedFromFlags(await fetchFlags(token));
    } catch (err) {
      console.warn(
        `[intents] Could not read application flags (${err.message}); starting without privileged intents.`
      );
      granted = { members: false, messageContent: false };
    }
  }

  return { mode, granted, intents: buildIntents(granted) };
}

function describeIntents({ mode, granted }) {
  const onOff = (value) => (value ? "on" : "off");
  const degraded = [];
  if (!granted.members) degraded.push("welcome messages");
  if (!granted.messageContent) {
    degraded.push(
      "rep from thank-you messages",
      "purge content filters",
      "modmail/mod-DM staff replies need an @mention of the bot"
    );
  }

  const summary = `[intents] mode=${mode} members=${onOff(granted.members)} messageContent=${onOff(granted.messageContent)}`;
  return degraded.length ? `${summary} — degraded: ${degraded.join(", ")}` : summary;
}

function isDisallowedIntentsError(err) {
  return (
    err?.code === GatewayCloseCodes.DisallowedIntents ||
    /disallowed intents/i.test(err?.message ?? "")
  );
}

function explainDisallowedIntents({ mode, granted }) {
  const requested = [
    granted.members && "Server Members",
    granted.messageContent && "Message Content",
  ].filter(Boolean);

  return [
    `[intents] Discord rejected the gateway connection (4014: disallowed intents).`,
    `[intents] Requested privileged intents: ${requested.join(", ") || "none"} (PRIVILEGED_INTENTS=${mode}).`,
    `[intents] This application has not been granted them. Set PRIVILEGED_INTENTS=auto (or false) to start in degraded mode,`,
    `[intents] or check Privileged Gateway Intents / intent review status in the Discord Developer Portal.`,
  ].join("\n");
}

// Unknown clients (mocks in verify scripts) are treated as fully privileged.
function clientHasIntent(client, intent) {
  const intents = client?.options?.intents;
  if (typeof intents?.has !== "function") return true;
  return intents.has(intent);
}

function hasMessageContent(client) {
  return clientHasIntent(client, GatewayIntentBits.MessageContent);
}

function hasGuildMembers(client) {
  return clientHasIntent(client, GatewayIntentBits.GuildMembers);
}

module.exports = {
  getMode,
  grantedFromFlags,
  buildIntents,
  resolveIntents,
  describeIntents,
  isDisallowedIntentsError,
  explainDisallowedIntents,
  hasMessageContent,
  hasGuildMembers,
};
