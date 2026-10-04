const { DEFINITION_LIMITS } = require("@ralevel/db");
const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const {
  getDefinitionsConfig,
  canModifyDirectly,
  pickContent,
  searchDefinitions,
  resolveDefinition,
  definitionChoice,
  buildDefinitionEmbed,
} = require("../../utils/definitions");
const {
  deleteDefinition,
  logDefinitionChange,
  findPendingRequest,
  submitRequest,
} = require("../../utils/definitionActions");

const CONFIRM_TIMEOUT_MS = 30_000;

async function confirmAndDelete(interaction, definition, reason) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("define-delete-confirm")
      .setLabel("Delete")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId("define-delete-cancel")
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Secondary),
  );

  const response = await interaction.reply({
    content: "Delete this definition? This can't be undone.",
    embeds: [buildDefinitionEmbed(definition)],
    components: [row],
    allowedMentions: { parse: [] },
  });

  let button;
  try {
    button = await response.awaitMessageComponent({
      filter: (i) => i.user.id === interaction.user.id,
      time: CONFIRM_TIMEOUT_MS,
    });
  } catch {
    return interaction.editReply({
      content: "⌛ Timed out — nothing was deleted.",
      embeds: [],
      components: [],
    });
  }

  if (button.customId === "define-delete-cancel") {
    return button.update({ content: "Cancelled.", embeds: [], components: [] });
  }

  const deleted = await deleteDefinition(definition.definitionId);
  if (!deleted) {
    return button.update({
      content: "⚠️ That definition was already deleted.",
      embeds: [],
      components: [],
    });
  }

  await logDefinitionChange(interaction.client, {
    action: "deleted",
    definition: deleted,
    actor: { id: interaction.user.id, tag: interaction.user.tag },
    note: reason,
  });
  return button.update({
    content: `🗑️ Deleted **${deleted.term}** (definition #${deleted.definitionId}).`,
    embeds: [],
    components: [],
  });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("delete-define")
    .setDescription("Delete a definition (or request its removal for review).")
    .addStringOption((opt) =>
      opt
        .setName("term")
        .setDescription("Definition to delete")
        .setRequired(true)
        .setAutocomplete(true),
    )
    .addStringOption((opt) =>
      opt
        .setName("reason")
        .setDescription("Why it should be removed (required when it goes to review)")
        .setMaxLength(DEFINITION_LIMITS.note),
    ),

  async autocomplete(interaction) {
    const results = await searchDefinitions(interaction.options.getFocused());
    return interaction.respond(results.map(definitionChoice));
  },

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

    const reason = (interaction.options.getString("reason") || "").trim();

    if (canModifyDirectly(interaction.member, interaction.user.id, definition)) {
      return confirmAndDelete(interaction, definition, reason);
    }

    if (!reason) {
      return interaction.reply({
        content:
          "❌ Removal requests are reviewed by staff, so please add a `reason` explaining what's wrong with this definition.",
      });
    }

    await interaction.deferReply();

    const pending = await findPendingRequest({
      type: "delete",
      definitionId: definition.definitionId,
    });
    if (pending) {
      return interaction.editReply(
        `❌ A removal request for this definition is already waiting for review (request #${pending.requestId}).`,
      );
    }

    const result = await submitRequest(interaction, {
      type: "delete",
      definitionId: definition.definitionId,
      subjectId: definition.subjectId,
      boardId: definition.boardId,
      original: pickContent(definition),
      note: reason,
    });
    if (!result.ok) return interaction.editReply(result.message);

    return interaction.editReply(
      `📨 Your removal request was sent for review as request **#${result.request.requestId}**. You'll get a DM when it's reviewed.`,
    );
  },
};
