require("dotenv").config();
const { Client, GatewayIntentBits } = require("discord.js");
const connectDB = require("./database.js");
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

// Connect DB
connectDB();

// Client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

loadCommands(client); // loads slash commands
const handleReputation = reputationSystem(client);
certificateSystem(client); // attach cert button logic
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

client.login(process.env.TOKEN);
