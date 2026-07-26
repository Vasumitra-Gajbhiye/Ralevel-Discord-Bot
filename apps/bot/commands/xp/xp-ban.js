const { XpBan } = require("@ralevel/db");
const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("xp-ban")
    .setDescription("Prevent a user from earning XP.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("The user to XP-ban.")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("Optional reason for the XP ban."),
    ),

  async execute(interaction) {
    const target = interaction.options.getUser("user");
    const reason = interaction.options.getString("reason");

    await XpBan.updateOne(
      { userId: target.id },
      { $set: { reason: reason || undefined } },
      { upsert: true },
    );

    return interaction.reply(
      `🚫 ${target} has been **banned from earning XP**.`,
    );
  },
};
