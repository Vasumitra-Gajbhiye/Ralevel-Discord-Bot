const { ModmailTicket } = require("@ralevel/db");
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("close")
    .setDescription("Close this modmail ticket.")
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

    const ticket = await ModmailTicket.findOne({
      channelId: interaction.channel.id,
      status: "OPEN",
    });

    if (!ticket) {
      return interaction.reply({
        content: "This channel is not an open modmail ticket.",
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
          ? `Your modmail ticket has been closed.\n\n**Reason:** ${reason}`
          : "Your modmail ticket has been closed. You can DM me again anytime to open a new one."
      )
      .setTimestamp();

    try {
      const user = await interaction.client.users.fetch(ticket.userId);
      await user.send({ embeds: [closeEmbed] });
    } catch {
      // User may have DMs closed; still close the ticket.
    }

    await interaction.editReply({
      content: "Ticket closed. Deleting this channel…",
    });

    try {
      await interaction.channel.delete(
        `Modmail closed by ${interaction.user.tag}`
      );
    } catch (err) {
      console.error("[modmail] Failed to delete ticket channel:", err);
      await interaction.followUp({
        content:
          "Ticket marked closed, but I couldn't delete this channel. Please delete it manually.",
        ephemeral: true,
      });
    }
  },
};
