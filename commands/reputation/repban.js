const { SlashCommandBuilder } = require("discord.js");
const RepBan = require("../../models/repban.js");
const { ROLE_ADMIN } = require("../../utils/roles.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("repban")
    .setDescription("Prevent a user from receiving reputation.")
    .addUserOption((o) =>
      o.setName("user").setDescription("The user to rep-ban.").setRequired(true)
    ),

  async execute(interaction) {
    if (!interaction.member.roles.cache.has(ROLE_ADMIN))
      return interaction.reply({
        content: "❌ You do not have permission.",
        ephemeral: true,
      });

    const target = interaction.options.getUser("user");
    await RepBan.updateOne({ userId: target.id }, {}, { upsert: true });

    return interaction.reply(
      `🚫 ${target} has been **banned from receiving reputation**.`
    );
  },
};
