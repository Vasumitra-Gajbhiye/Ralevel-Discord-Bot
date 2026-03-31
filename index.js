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
const messageTracker = require("./systems/messageTracker");
const dailyFinalizeSystem = require("./systems/dailyFinalizeSystem");

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
reputationSystem(client); // attach message handler
certificateSystem(client); // attach cert button logic
stickySystem(client);
qotdSystem(client);
welcomeSystem(client);
confessionsSystem(client);
messageTracker(client);
dailyFinalizeSystem(client);

client.login(process.env.TOKEN);
