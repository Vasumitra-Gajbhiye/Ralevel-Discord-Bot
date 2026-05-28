const { SlashCommandBuilder } = require("discord.js");
const RepBan = require("../../models/repban.js");
const { ROLE_ADMIN } = require("../../utils/roles.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("rep-unban")
    .setDescription("Allow a user to receive reputation again.")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("The user to unban.")
        .setRequired(true),
    ),

  async execute(interaction) {
    if (!interaction.member.roles.cache.has(ROLE_ADMIN))
      return interaction.reply({
        content: "❌ You do not have permission.",
        ephemeral: true,
      });

    const target = interaction.options.getUser("user");
    await RepBan.deleteOne({ userId: target.id });

    return interaction.reply(
      `✅ ${target} is now **allowed to receive rep again**.`,
    );
  },
};
