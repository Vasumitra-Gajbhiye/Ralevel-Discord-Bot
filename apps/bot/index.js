require("./loadEnv");
const { connectDB } = require("@ralevel/db");
const { Client, GatewayIntentBits } = require("discord.js");
const loadGuildConfig = require("./utils/loadGuildConfig");
const loadCommands = require("./systems/commands.js");
const reputationSystem = require("./systems/reputation.js");
const certificateSystem = require("./systems/certificates.js");
const stickySystem = require("./systems/sticky");
const qotdSystem = require("./systems/qotd");
const welcomeSystem = require("./systems/welcome");
const confessionsSystem = require("./systems/confessions.js");
const { handleMessageTracker } = require("./systems/messageTracker");
const messageRouter = require("./systems/messageRouter");
const dailyFinalizeSystem = require("./systems/dailyFinalizeSystem");
const pollSystem = require("./systems/polls");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

async function start() {
  await connectDB();
  await loadGuildConfig(client);

  loadCommands(client);
  const handleReputation = reputationSystem(client);
  certificateSystem(client);
  const handleSticky = stickySystem(client);
  qotdSystem(client);
  welcomeSystem(client);
  confessionsSystem(client);
  messageRouter(client, {
    handleMessageTracker,
    handleSticky,
    handleReputation,
  });
  dailyFinalizeSystem(client);
  pollSystem(client);

  await client.login(process.env.TOKEN);
}

start().catch((err) => {
  console.error("Failed to start bot:", err);
  process.exit(1);
});
