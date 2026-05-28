// const fs = require("fs");
// const path = require("path");
// const { Collection } = require("discord.js");

// module.exports = (client) => {
//     client.commands = new Collection();

//     const commandsPath = path.join(__dirname, "..", "commands");

//     for (const folder of fs.readdirSync(commandsPath)) {
//         const folderPath = path.join(commandsPath, folder);
//         if (!fs.statSync(folderPath).isDirectory()) continue;

//         for (const file of fs.readdirSync(folderPath).filter(f => f.endsWith(".js"))) {
//             const cmd = require(path.join(folderPath, file));
//             if (cmd.data && cmd.execute) {
//                 client.commands.set(cmd.data.name, cmd);
//             }
//         }
//     }

//     client.on("interactionCreate", async interaction => {
//         if (!interaction.isChatInputCommand()) return;
//         const command = client.commands.get(interaction.commandName);
//         if (!command) return;
//         await command.execute(interaction);
//     });
// };
const fs = require("fs");
const path = require("path");
const { Collection } = require("discord.js");

// 1. Import your new config file
const permissionsConfig = require("../permissions.config.js");

module.exports = (client) => {
  client.commands = new Collection();

  const commandsPath = path.join(__dirname, "..", "commands");

  for (const folder of fs.readdirSync(commandsPath)) {
    const folderPath = path.join(commandsPath, folder);
    if (!fs.statSync(folderPath).isDirectory()) continue;

    for (const file of fs
      .readdirSync(folderPath)
      .filter((f) => f.endsWith(".js"))) {
      const cmd = require(path.join(folderPath, file));
      if (cmd.data && cmd.execute) {
        client.commands.set(cmd.data.name, cmd);
      }
    }
  }

  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    // ==========================================
    // 🛡️ GLOBAL ROLE ACCESS CHECK
    // ==========================================
    const allowedRoles = permissionsConfig.commands[interaction.commandName];

    if (allowedRoles) {
      // Prevent crashes if someone tries to use a restricted command in a DM
      if (!interaction.member) {
        return interaction.reply({
          content: "❌ Restricted commands can only be used inside the server.",
          ephemeral: true,
        });
      }

      // Check if the user has AT LEAST ONE of the allowed roles
      const hasPermission = interaction.member.roles.cache.some((role) =>
        allowedRoles.includes(role.id),
      );

      if (!hasPermission) {
        return interaction.reply({
          content: "❌ You do not have permission to use this command.",
          ephemeral: true,
        });
      }
    }

    // ==========================================
    // ⚙️ COMMAND EXECUTION
    // ==========================================
    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(
        `[ERROR] Command /${interaction.commandName} failed:`,
        error,
      );

      const errorMessage =
        "❌ There was an error while executing this command!";

      // Handle cases where the command might have already deferred/replied before crashing
      if (interaction.replied || interaction.deferred) {
        await interaction
          .followUp({ content: errorMessage, ephemeral: true })
          .catch(() => {});
      } else {
        await interaction
          .reply({ content: errorMessage, ephemeral: true })
          .catch(() => {});
      }
    }
  });
};
