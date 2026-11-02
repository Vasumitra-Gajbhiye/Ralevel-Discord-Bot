const { SlashCommandSubcommandBuilder } = require("discord.js");

/**
 * Turns command modules that export `subcommand(builder)`, `execute` and
 * optionally `autocomplete` into one slash command with a subcommand each.
 * Role gates and ephemeral settings are stored per subcommand
 * ("sticky add"), see getCommandSettingKey in systems/commands.js.
 */
function buildSubcommandCommand(builder, handlers) {
  const handlersByName = new Map();

  for (const handler of handlers) {
    const subcommand = handler.subcommand(new SlashCommandSubcommandBuilder());
    handlersByName.set(subcommand.name, handler);
    builder.addSubcommand(subcommand);
  }

  const getHandler = (interaction) =>
    handlersByName.get(interaction.options.getSubcommand());

  return {
    data: builder,
    subcommandSettings: true,

    async autocomplete(interaction) {
      const handler = getHandler(interaction);
      if (!handler?.autocomplete) return interaction.respond([]);
      return handler.autocomplete(interaction);
    },

    async execute(interaction) {
      return getHandler(interaction).execute(interaction);
    },
  };
}

module.exports = { buildSubcommandCommand };
