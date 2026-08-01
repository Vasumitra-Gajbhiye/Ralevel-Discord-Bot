const { Note } = require("@ralevel/db");
const { SlashCommandBuilder } = require("discord.js");
const logModAction = require("../../utils/logModAction");
const generateActionId = require("../../utils/generateId.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("delete-note")
    .setDescription("Delete a specific staff note by its action ID")
    .addStringOption((opt) =>
      opt
        .setName("actionid")
        .setDescription("Action ID of the note")
        .setRequired(true),
    )
    .addStringOption((opt) =>
      opt
        .setName("reason")
        .setDescription("Reason for deleting the note")
        .setRequired(true),
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const actionId = interaction.options.getString("actionid");
    const reason = interaction.options.getString("reason");

    const note = await Note.findOne({ actionId });

    if (!note)
      return interaction.editReply({
        content: "❌ No note found with that ID.",
      });

    await Note.deleteOne({ actionId });

    const newActionId = generateActionId();

    await logModAction({
      interaction,
      userId: note.userId,
      userTag: note.userTag,
      moderatorTag: interaction.user.tag,
      moderatorId: interaction.user.id,
      action: "note-delete",
      reason: note.content,
      actionId: newActionId,
      deletedNoteId: actionId,
      noteDelReason: reason,
    });

    return interaction.editReply(`🗑️ Note **${actionId}** deleted.`);
  },
};
