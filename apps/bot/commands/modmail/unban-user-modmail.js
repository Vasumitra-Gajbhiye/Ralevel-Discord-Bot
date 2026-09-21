const { ModmailBan } = require("@ralevel/db");
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require("discord.js");
const { buildUnbannedFromModmailEmbed } = require("../../systems/modmail");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("unban-user-modmail")
    .setDescription("Allow a user to open modmail tickets again.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("The user to unban from modmail.")
        .setRequired(true),
    ),

  async execute(interaction) {
    const target = interaction.options.getUser("user", true);

    const result = await ModmailBan.deleteOne({ userId: target.id });

    if (result.deletedCount === 0) {
      return interaction.reply({
        content: `${target} is not banned from modmail.`,
        ephemeral: true,
      });
    }

    let notified = true;
    try {
      await target.send({ embeds: [buildUnbannedFromModmailEmbed()] });
    } catch {
      notified = false; // User may have DMs closed.
    }

    return interaction.reply({
      content: notified
        ? `${target} can use modmail again.`
        : `${target} can use modmail again, but I couldn't DM them (their DMs may be closed).`,
      ephemeral: true,
    });
  },
};
