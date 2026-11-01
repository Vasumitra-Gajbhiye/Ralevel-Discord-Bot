require("./loadEnv");
const { connectDB } = require("@ralevel/db");
const { Client, Partials } = require("discord.js");
const {
  loadGuildConfig,
  startGuildConfigWatcher,
} = require("./utils/loadGuildConfig");
const modPoints = require("./utils/modPoints");
const { loadContentOptOuts } = require("./utils/contentOptOut");
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

const {
  resolveIntents,
  describeIntents,
  isDisallowedIntentsError,
  shouldRetryWithoutPrivilegedIntents,
  withoutPrivilegedIntents,
  explainDisallowedIntents,
} = require("./utils/privilegedIntents");

let client;

// Builds a client and wires every client-bound system to it. Kept separate from
// start() so a refused login can rebuild everything against a new client.
async function connect(intentConfig) {
  console.log(describeIntents(intentConfig));
  client = new Client({
    intents: intentConfig.intents,
    partials: [Partials.Channel],
  });

  await loadGuildConfig(client);
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
  channelDirectorySystem(client);

  await client.login(process.env.TOKEN);

  // These start timers immediately rather than on "ready", so they wait for a
  // successful login and never keep running against a refused client.
  startGuildConfigWatcher(client);
  xpFlushSystem(client);
  pollSystem(client);
  examLockSystem(client);
}

async function connectWithFallback(intentConfig) {
  try {
    await connect(intentConfig);
  } catch (err) {
    if (shouldRetryWithoutPrivilegedIntents(err, intentConfig)) {
      console.warn(
        "[intents] Discord refused the privileged intents (4014) despite the application flags; retrying without them."
      );
      client.destroy();
      return connectWithFallback(withoutPrivilegedIntents(intentConfig));
    }
    if (!isDisallowedIntentsError(err)) throw err;
    console.error(explainDisallowedIntents(intentConfig));
    process.exit(1);
  }
}

async function start() {
  const { commandCount } = exportCommandCatalog();
  console.log(`[command-catalog] Exported ${commandCount} commands.`);

  await connectDB();
  // Before login so the message handlers never see a half-loaded opt-out set.
  await loadContentOptOuts();
  const backfilled = await modPoints.backfillExpiry();
  if (backfilled > 0) {
    console.log(`[modPoints] Set expiresAt on ${backfilled} older warnings/point entries.`);
  }
  startCommandSyncServer();

  // Resolved before the client is built so PRIVILEGED_INTENTS=auto can drop
  // intents Discord hasn't granted instead of failing login with 4014.
  await connectWithFallback(await resolveIntents());
}

function shutdown(signal) {
  console.log(`[bot] ${signal} received, destroying Discord client`);
  try {
    client?.destroy();
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
