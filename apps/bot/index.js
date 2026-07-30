require("./loadEnv");
const { connectDB } = require("@ralevel/db");
const { Client, GatewayIntentBits, Partials } = require("discord.js");
const {
  loadGuildConfig,
  startGuildConfigWatcher,
} = require("./utils/loadGuildConfig");
const loadCommands = require("./systems/commands.js");
const reputationSystem = require("./systems/reputation.js");
const certificateSystem = require("./systems/certificates.js");
const stickySystem = require("./systems/sticky");
const qotdSystem = require("./systems/qotd");
const welcomeSystem = require("./systems/welcome");
const confessionsSystem = require("./systems/confessions.js");
const ruleSyncSystem = require("./systems/ruleSync");
const modmailSystem = require("./systems/modmail");
const { handleMessageTracker } = require("./systems/messageTracker");
const messageRouter = require("./systems/messageRouter");
const xpFlushSystem = require("./systems/xpFlushSystem");
const pollSystem = require("./systems/polls");
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
  deployCommandsOnReady(client);

  loadCommands(client);
  const handleReputation = reputationSystem(client);
  certificateSystem(client);
  const handleSticky = stickySystem(client);
  qotdSystem(client);
  welcomeSystem(client);
  confessionsSystem(client);
  ruleSyncSystem(client);
  const { handleModmailDm, handleModmailStaffReply } = modmailSystem(client);
  messageRouter(client, {
    handleMessageTracker,
    handleSticky,
    handleReputation,
    handleModmailDm,
    handleModmailStaffReply,
  });
  xpFlushSystem(client);
  pollSystem(client);
  startCommandSyncServer();

  await client.login(process.env.TOKEN);
}

start().catch((err) => {
  console.error("Failed to start bot:", err);
  process.exit(1);
});
