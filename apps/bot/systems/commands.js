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

const checkRoleHierarchy = require("../utils/checkRoleHierarchy.js");
const checkRoleAssignment = require("../utils/checkRoleAssignment.js");
const { getCommandAllowedRoleIds } = require("../utils/guildConfigStore");

// Commands that act on a member and require role hierarchy checks.
// Value is the slash-command option name that holds the target user.
const HIERARCHY_TARGET_OPTIONS = {
  warn: "user",
  kick: "user",
  ban: "user",
  softban: "user",
  timeout: "user",
  untimeout: "user",
  "clear-warnings": "user",
  setnickname: "user",
  "add-role": "user",
  "remove-role": "user",
  purge: "target",
};

// Commands that assign/remove a role; value is the slash-command role option name.
const HIERARCHY_ROLE_OPTIONS = {
  "add-role": "role",
  "remove-role": "role",
};

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
    const allowedRoles = getCommandAllowedRoleIds(interaction.commandName);

    if (allowedRoles && allowedRoles.length > 0) {
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
    // 🪜 ROLE HIERARCHY CHECK (moderation)
    // ==========================================
    const targetOption = HIERARCHY_TARGET_OPTIONS[interaction.commandName];

    if (targetOption && interaction.member && interaction.guild) {
      const targetUser = interaction.options.getUser(targetOption);

      if (targetUser) {
        const targetMember =
          interaction.options.getMember(targetOption) ??
          (await interaction.guild.members
            .fetch(targetUser.id)
            .catch(() => null));

        if (targetMember) {
          const hierarchyError = checkRoleHierarchy(interaction, targetMember);

          if (hierarchyError) {
            return interaction.reply({
              content: hierarchyError.message,
              ephemeral: true,
            });
          }

          const roleOption =
            HIERARCHY_ROLE_OPTIONS[interaction.commandName];
          if (roleOption) {
            const role = interaction.options.getRole(roleOption);
            if (role) {
              const assignmentError = checkRoleAssignment(
                interaction,
                targetMember,
                role,
              );

              if (assignmentError) {
                return interaction.reply({
                  content: assignmentError.message,
                  ephemeral: true,
                });
              }
            }
          }
        }
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
