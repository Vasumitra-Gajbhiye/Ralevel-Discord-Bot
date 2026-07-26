const { XpBan } = require("@ralevel/db");
const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("xp-unban")
    .setDescription("Allow a user to earn XP again.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("The user to unban.")
        .setRequired(true),
    ),

  async execute(interaction) {
    const target = interaction.options.getUser("user");
    await XpBan.deleteOne({ userId: target.id });

    return interaction.reply(
      `✅ ${target} is now **allowed to earn XP again**.`,
    );
  },
};
