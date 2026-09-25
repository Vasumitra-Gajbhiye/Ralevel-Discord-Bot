const { Definition, DEFINITION_LIMITS } = require("@ralevel/db");
const { SlashCommandBuilder } = require("discord.js");
const {
  getDefinitionsConfig,
  parseDefinitionRef,
  searchDefinitions,
  resolveDefinition,
  definitionChoice,
  definitionScopeLabel,
  subjectChoices,
  boardChoices,
  buildDefinitionEmbed,
  buildSuggestRow,
} = require("../../utils/definitions");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("define")
    .setDescription("Look up the definition of a term.")
    .addStringOption((opt) =>
      opt
        .setName("term")
        .setDescription("Term to look up")
        .setRequired(true)
        .setMaxLength(DEFINITION_LIMITS.term)
        .setAutocomplete(true),
    )
    .addStringOption((opt) =>
      opt
        .setName("subject")
        .setDescription("Only search this subject")
        .setAutocomplete(true),
    )
    .addStringOption((opt) =>
      opt
        .setName("board")
        .setDescription("Only search this exam board")
        .setAutocomplete(true),
    ),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused(true);

    if (focused.name === "subject") {
      return interaction.respond(subjectChoices(focused.value, { enabledOnly: false }));
    }
    if (focused.name === "board") {
      return interaction.respond(boardChoices(focused.value, { enabledOnly: false }));
    }

    const results = await searchDefinitions(focused.value, {
      subjectId: interaction.options.getString("subject"),
      boardId: interaction.options.getString("board"),
    });
    return interaction.respond(results.map(definitionChoice));
  },

  async execute(interaction) {
    if (!getDefinitionsConfig().enabled) {
      return interaction.reply({ content: "📘 Definitions are currently turned off." });
    }

    const raw = interaction.options.getString("term", true);
    const scope = {
      subjectId: interaction.options.getString("subject"),
      boardId: interaction.options.getString("board"),
    };

    const { definition, others } = await resolveDefinition(raw, scope);

    if (!definition) {
      const typed = parseDefinitionRef(raw).text || raw;
      const suggestions = await searchDefinitions(typed, scope, 5);
      const hint = suggestions.length
        ? `\nDid you mean: ${suggestions.map((d) => `**${d.term}** (${definitionScopeLabel(d)})`).join(", ")}?`
        : "";
      return interaction.reply({
        content: `❌ No definition found for **${typed}**.${hint}\nYou can add one with \`/add-define\`.`,
        allowedMentions: { parse: [] },
      });
    }

    Definition.updateOne(
      { definitionId: definition.definitionId },
      { $inc: { views: 1 } },
      { timestamps: false },
    ).catch((err) => console.error("[define] Failed to count view:", err));

    const alsoIn = others.length
      ? `Also defined in: ${others.map(definitionScopeLabel).join(", ")}. Pick one from the suggestions to see it.`
      : undefined;

    return interaction.reply({
      content: alsoIn,
      embeds: [buildDefinitionEmbed(definition)],
      components: [buildSuggestRow(definition.definitionId)],
      allowedMentions: { parse: [] },
    });
  },
};
