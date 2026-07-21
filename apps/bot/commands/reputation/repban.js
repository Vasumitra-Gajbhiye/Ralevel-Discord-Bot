const { RepBan } = require("@ralevel/db");
const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("rep-ban")
    .setDescription("Prevent a user from receiving reputation.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addUserOption((o) =>
      o
        .setName("user")
        .setDescription("The user to rep-ban.")
        .setRequired(true),
    ),

  async execute(interaction) {
    const target = interaction.options.getUser("user");
    await RepBan.updateOne({ userId: target.id }, {}, { upsert: true });

    return interaction.reply(
      `🚫 ${target} has been **banned from receiving reputation**.`,
    );
  },
};
