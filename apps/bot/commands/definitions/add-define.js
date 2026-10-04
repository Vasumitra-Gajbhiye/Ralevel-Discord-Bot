const { DEFINITION_LIMITS, normalizeTermKey } = require("@ralevel/db");
const { SlashCommandBuilder } = require("discord.js");
const {
  getDefinitionsConfig,
  getSubject,
  getBoard,
  canAddDirectly,
  cleanContent,
  findDefinitionByKey,
  subjectChoices,
  boardChoices,
  fieldValueChoices,
  buildDefinitionEmbed,
} = require("../../utils/definitions");
const {
  createDefinition,
  logDefinitionChange,
  findPendingRequest,
  submitRequest,
} = require("../../utils/definitionActions");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("add-define")
    .setDescription("Add a definition (helpers add directly; others are reviewed).")
    .addStringOption((opt) =>
      opt
        .setName("subject")
        .setDescription("Subject the definition belongs to")
        .setRequired(true)
        .setAutocomplete(true),
    )
    .addStringOption((opt) =>
      opt
        .setName("term")
        .setDescription("The word or phrase being defined")
        .setRequired(true)
        .setMaxLength(DEFINITION_LIMITS.term),
    )
    .addStringOption((opt) =>
      opt
        .setName("definition")
        .setDescription("The definition")
        .setRequired(true)
        .setMaxLength(DEFINITION_LIMITS.definition),
    )
    .addStringOption((opt) =>
      opt
        .setName("board")
        .setDescription("Exam board (leave empty if it applies to every board)")
        .setAutocomplete(true),
    )
    .addStringOption((opt) =>
      opt
        .setName("chapter")
        .setDescription("Chapter (optional)")
        .setMaxLength(DEFINITION_LIMITS.chapter)
        .setAutocomplete(true),
    )
    .addStringOption((opt) =>
      opt
        .setName("topic")
        .setDescription("Topic (optional)")
        .setMaxLength(DEFINITION_LIMITS.topic)
        .setAutocomplete(true),
    ),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused(true);

    if (focused.name === "subject") {
      return interaction.respond(subjectChoices(focused.value));
    }
    if (focused.name === "board") {
      return interaction.respond(boardChoices(focused.value));
    }
    if (focused.name === "chapter" || focused.name === "topic") {
      return interaction.respond(
        await fieldValueChoices(
          focused.name,
          focused.value,
          interaction.options.getString("subject"),
        ),
      );
    }
    return interaction.respond([]);
  },

  async execute(interaction) {
    if (!getDefinitionsConfig().enabled) {
      return interaction.reply({ content: "📘 Definitions are currently turned off." });
    }

    await interaction.deferReply();

    const subject = getSubject(interaction.options.getString("subject", true), {
      enabledOnly: true,
    });
    if (!subject) {
      return interaction.editReply("❌ Pick a subject from the suggestions list.");
    }

    const rawBoard = interaction.options.getString("board");
    const board = rawBoard ? getBoard(rawBoard, { enabledOnly: true }) : null;
    if (rawBoard && !board) {
      return interaction.editReply(
        "❌ Pick an exam board from the suggestions list, or leave it empty.",
      );
    }
    const boardId = board?.id || "";

    const cleaned = cleanContent({
      term: interaction.options.getString("term", true),
      definition: interaction.options.getString("definition", true),
      chapter: interaction.options.getString("chapter"),
      topic: interaction.options.getString("topic"),
    });
    if (!cleaned.ok) return interaction.editReply(cleaned.error);
    const content = cleaned.content;
    const termKey = normalizeTermKey(content.term);

    const existing = await findDefinitionByKey({
      subjectId: subject.id,
      boardId,
      termKey,
    });
    if (existing) {
      return interaction.editReply(
        `❌ **${existing.term}** is already defined for ${subject.label} (definition #${existing.definitionId}). Use \`/define\` and press **Suggest improvement** to improve it.`,
      );
    }

    const user = { id: interaction.user.id, tag: interaction.user.tag };

    if (canAddDirectly(interaction.member, subject.id)) {
      const result = await createDefinition({
        subjectId: subject.id,
        boardId,
        content,
        author: user,
      });
      if (!result.ok) {
        return interaction.editReply(
          `❌ **${content.term}** was just added by someone else. Look it up with \`/define\`.`,
        );
      }

      await logDefinitionChange(interaction.client, {
        action: "added",
        definition: result.definition,
        actor: user,
      });
      return interaction.editReply({
        content: "✅ Definition added.",
        embeds: [buildDefinitionEmbed(result.definition)],
        allowedMentions: { parse: [] },
      });
    }

    const pending = await findPendingRequest({
      type: "create",
      subjectId: subject.id,
      boardId,
      termKey,
    });
    if (pending) {
      return interaction.editReply(
        `❌ A definition for **${content.term}** in ${subject.label} is already waiting for review (request #${pending.requestId}).`,
      );
    }

    const result = await submitRequest(interaction, {
      type: "create",
      subjectId: subject.id,
      boardId,
      termKey,
      proposed: content,
    });
    if (!result.ok) return interaction.editReply(result.message);

    return interaction.editReply(
      `📨 Thanks! **${content.term}** was sent for review as request **#${result.request.requestId}**. You'll get a DM when it's reviewed.`,
    );
  },
};
