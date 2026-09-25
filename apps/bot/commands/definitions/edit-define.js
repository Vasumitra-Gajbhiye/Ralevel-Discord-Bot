const { SlashCommandBuilder } = require("discord.js");
const {
  getDefinitionsConfig,
  searchDefinitions,
  resolveDefinition,
  definitionChoice,
  buildEditModal,
} = require("../../utils/definitions");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("edit-define")
    .setDescription("Improve a definition (your change is reviewed unless you wrote it as a helper).")
    .addStringOption((opt) =>
      opt
        .setName("term")
        .setDescription("Definition to edit")
        .setRequired(true)
        .setAutocomplete(true),
    ),

  async autocomplete(interaction) {
    const results = await searchDefinitions(interaction.options.getFocused());
    return interaction.respond(results.map(definitionChoice));
  },

  // Opens a pre-filled form; the submission is handled in systems/definitions.js
  async execute(interaction) {
    if (!getDefinitionsConfig().enabled) {
      return interaction.reply({ content: "📘 Definitions are currently turned off." });
    }

    const { definition, others } = await resolveDefinition(
      interaction.options.getString("term", true),
    );
    if (!definition) {
      return interaction.reply({
        content: "❌ No definition found. Pick one from the suggestions list.",
      });
    }
    if (others.length) {
      return interaction.reply({
        content:
          "❌ That term is defined in more than one subject. Pick the exact one from the suggestions list.",
      });
    }

    return interaction.showModal(buildEditModal(definition));
  },
};
