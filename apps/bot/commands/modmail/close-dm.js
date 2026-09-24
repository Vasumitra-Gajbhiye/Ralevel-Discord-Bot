const { ModDm } = require("@ralevel/db");
const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const {
  closeModDm,
  closeResultMessage,
  isModDmForumParent,
} = require("../../systems/modDm");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("close-dm")
    .setDescription("Close this moderator DM conversation.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addStringOption((opt) =>
      opt
        .setName("reason")
        .setDescription("Optional reason shown to the user")
        .setRequired(false)
        .setMaxLength(500),
    ),

  async execute(interaction) {
    if (
      !interaction.guild ||
      !interaction.channel?.isThread?.() ||
      !isModDmForumParent(interaction.channel.parentId)
    ) {
      return interaction.reply({
        content: "This command can only be used in a moderator DM post.",
        ephemeral: true,
      });
    }

    const reason = interaction.options.getString("reason")?.trim() || null;

    await interaction.deferReply({ ephemeral: true });

    const doc = await ModDm.findOne({
      threadId: interaction.channel.id,
      status: "OPEN",
    });

    if (!doc) {
      return interaction.editReply({
        content: "This conversation is already closed. Run `/dm` to reopen it.",
      });
    }

    const notice = reason
      ? `🔒 **Conversation closed** by ${interaction.user}.\n**Reason:** ${reason}`
      : `🔒 **Conversation closed** by ${interaction.user}.`;

    const result = await closeModDm(interaction.client, doc, {
      closedBy: interaction.user.id,
      reason,
      thread: interaction.channel,
      notice,
      archiveReason: `Moderator DM closed by ${interaction.user.tag}`,
      notifyUser: true,
    });

    return interaction.editReply({ content: closeResultMessage(result) });
  },
};
