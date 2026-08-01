const { ModmailTicket } = require("@ralevel/db");
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} = require("discord.js");
const { tryGetGuildConfig } = require("../../utils/guildConfigStore");

function getModMailChannelId() {
  const fromConfig = tryGetGuildConfig()?.modmail?.forumChannelId;
  if (typeof fromConfig === "string" && fromConfig.trim()) {
    return fromConfig.trim();
  }
  return process.env.MOD_MAIL_CHANNEL_ID || null;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("close-ticket")
    .setDescription("Close this modmail support ticket.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addStringOption((opt) =>
      opt
        .setName("reason")
        .setDescription("Optional reason shown to the user")
        .setRequired(false)
        .setMaxLength(500)
    ),

  async execute(interaction) {
    if (!interaction.guild || !interaction.channel) {
      return interaction.reply({
        content: "This command can only be used in a server channel.",
        ephemeral: true,
      });
    }

    if (!interaction.channel.isThread?.()) {
      return interaction.reply({
        content: "This command can only be used in a modmail forum post.",
        ephemeral: true,
      });
    }

    const forumId = getModMailChannelId();
    if (!forumId || interaction.channel.parentId !== forumId) {
      return interaction.reply({
        content: "This channel is not a modmail support ticket.",
        ephemeral: true,
      });
    }

    const ticket = await ModmailTicket.findOne({
      threadId: interaction.channel.id,
      status: "OPEN",
    });

    if (!ticket) {
      return interaction.reply({
        content: "This post is not an open modmail ticket.",
        ephemeral: true,
      });
    }

    const reason = interaction.options.getString("reason");

    await interaction.deferReply({ ephemeral: true });

    ticket.status = "CLOSED";
    ticket.closedBy = interaction.user.id;
    ticket.closedAt = new Date();
    await ticket.save();

    const closeEmbed = new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle("Ticket Closed")
      .setDescription(
        reason
          ? `Your support ticket has been closed.\n\n**Reason:** ${reason}\n\nYou can DM me again anytime if you need to open a new ticket.`
          : "Your support ticket has been closed. You can DM me again anytime if you need to open a new ticket."
      )
      .setTimestamp();

    try {
      const user = await interaction.client.users.fetch(ticket.userId);
      await user.send({ embeds: [closeEmbed] });
    } catch {
      // User may have DMs closed; still close the ticket.
    }

    try {
      if (!interaction.channel.archived) {
        await interaction.channel.setArchived(
          true,
          `Modmail closed by ${interaction.user.tag}`
        );
      }
    } catch (err) {
      console.error("[modmail] Failed to archive ticket thread:", err);
      await interaction.editReply({
        content:
          "Ticket marked closed, but I couldn't archive this post. Please archive it manually.",
      });
      return;
    }

    await interaction.editReply({
      content: "Ticket closed and archived.",
    });
  },
};
