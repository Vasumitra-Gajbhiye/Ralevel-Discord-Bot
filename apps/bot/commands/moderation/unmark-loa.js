const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");

const { changeLoaNickname } = require("../../utils/loaNickname.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("unmark-loa")
    .setDescription("Remove a user's LOA / partial LOA tag from their nickname.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames)

    .addUserOption((opt) =>
      opt
        .setName("user")
        .setDescription("User to remove the LOA tag from.")
        .setRequired(true)
    ),

  async execute(interaction) {
    return changeLoaNickname(interaction, "unmark-loa", null);
  },
};
