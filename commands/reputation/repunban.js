const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const RepBan = require("../../models/repban.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("rep-unban")
    .setDescription("Allow a user to receive reputation again.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("The user to unban.")
        .setRequired(true),
    ),

  async execute(interaction) {
    const target = interaction.options.getUser("user");
    await RepBan.deleteOne({ userId: target.id });

    return interaction.reply(
      `✅ ${target} is now **allowed to receive rep again**.`,
    );
  },
};
