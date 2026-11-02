const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { buildSubcommandCommand } = require("../../utils/subcommandCommand");

module.exports = buildSubcommandCommand(
  new SlashCommandBuilder()
    .setName("xp-admin")
    .setDescription("Change a user's XP or message count.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  [
    require("./add-xp"),
    require("./set-xp"),
    require("./subtract-xp"),
    require("./set-msg-count"),
  ],
);
