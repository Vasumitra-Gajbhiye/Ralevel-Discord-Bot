const { SlashCommandBuilder } = require("discord.js");
const { buildSubcommandCommand } = require("../../utils/subcommandCommand");

module.exports = buildSubcommandCommand(
  new SlashCommandBuilder()
    .setName("definition")
    .setDescription("Add, improve or delete a definition."),
  [
    require("./add-define"),
    require("./edit-define"),
    require("./delete-define"),
  ],
);
