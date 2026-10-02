require("./loadEnv");
const { connectDB } = require("@ralevel/db");
const { Client, GatewayIntentBits, Partials } = require("discord.js");
const {
  loadGuildConfig,
  startGuildConfigWatcher,
} = require("./utils/loadGuildConfig");
const modPoints = require("./utils/modPoints");
const loadCommands = require("./systems/commands.js");
const reputationSystem = require("./systems/reputation.js");
const certificateSystem = require("./systems/certificates.js");
const certRemindersSystem = require("./systems/certReminders");
const certForfeitSweeperSystem = require("./systems/certForfeitSweeper");
const stickySystem = require("./systems/sticky");
const qotdSystem = require("./systems/qotd");
const welcomeSystem = require("./systems/welcome");
const confessionsSystem = require("./systems/confessions.js");
const definitionsSystem = require("./systems/definitions");
const ruleSyncSystem = require("./systems/ruleSync");
const modmailSystem = require("./systems/modmail");
const modDmSystem = require("./systems/modDm");
const { handleMessageTracker } = require("./systems/messageTracker");
const messageRouter = require("./systems/messageRouter");
const xpFlushSystem = require("./systems/xpFlushSystem");
const pollSystem = require("./systems/polls");
const examLockSystem = require("./systems/examLockSystem");
const channelDirectorySystem = require("./systems/channelDirectory");
const { startCommandSyncServer } = require("./systems/commandSyncServer");
const { deployCommandsOnReady } = require("./systems/deployCommandsOnReady");
const { exportCommandCatalog } = require("./scripts/export-command-catalog");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel],
});

async function start() {
  const { commandCount } = exportCommandCatalog();
  console.log(`[command-catalog] Exported ${commandCount} commands.`);

  await connectDB();
  await loadGuildConfig(client);
  startGuildConfigWatcher(client);
  const backfilled = await modPoints.backfillExpiry();
  if (backfilled > 0) {
    console.log(`[modPoints] Set expiresAt on ${backfilled} older warnings/point entries.`);
  }
  deployCommandsOnReady(client);

  loadCommands(client);
  const handleReputation = reputationSystem(client);
  certificateSystem(client);
  certRemindersSystem(client);
  certForfeitSweeperSystem(client);
  const handleSticky = stickySystem(client);
  qotdSystem(client);
  welcomeSystem(client);
  confessionsSystem(client);
  definitionsSystem(client);
  ruleSyncSystem(client);
  const { handleModmailDm, handleModmailStaffReply } = modmailSystem(client);
  const { handleModDmUserMessage, handleModDmStaffReply } = modDmSystem(client);
  messageRouter(client, {
    handleMessageTracker,
    handleSticky,
    handleReputation,
    handleModmailDm,
    handleModmailStaffReply,
    handleModDmUserMessage,
    handleModDmStaffReply,
  });
  xpFlushSystem(client);
  pollSystem(client);
  examLockSystem(client);
  channelDirectorySystem(client);
  startCommandSyncServer();

  await client.login(process.env.TOKEN);
}

function shutdown(signal) {
  console.log(`[bot] ${signal} received, destroying Discord client`);
  try {
    client.destroy();
  } catch (err) {
    console.error("[bot] Failed to destroy Discord client:", err);
  }
  process.exit(0);
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));

start().catch((err) => {
  console.error("Failed to start bot:", err);
  process.exit(1);
});
