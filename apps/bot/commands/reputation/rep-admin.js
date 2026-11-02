const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { buildSubcommandCommand } = require("../../utils/subcommandCommand");

module.exports = buildSubcommandCommand(
  new SlashCommandBuilder()
    .setName("rep-admin")
    .setDescription("Change a user's reputation.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
  [require("./addrep"), require("./setrep"), require("./subrep")],
);
