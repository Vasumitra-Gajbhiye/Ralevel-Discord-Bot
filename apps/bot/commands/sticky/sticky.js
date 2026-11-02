const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { buildSubcommandCommand } = require("../../utils/subcommandCommand");

module.exports = buildSubcommandCommand(
  new SlashCommandBuilder()
    .setName("sticky")
    .setDescription("Manage sticky messages")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  [
    require("./add-sticky"),
    require("./edit-sticky"),
    require("./remove-sticky"),
    require("./sticky-list"),
    require("./sticky-log"),
    require("./sticky-resend"),
  ],
);
