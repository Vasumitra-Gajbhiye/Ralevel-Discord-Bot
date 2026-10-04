const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");

const { changeLoaNickname } = require("../../utils/loaNickname.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("mark-loa")
    .setDescription("Mark a user as on leave of absence (adds -LOA to their nickname).")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames)

    .addUserOption((opt) =>
      opt
        .setName("user")
        .setDescription("User to mark as LOA.")
        .setRequired(true)
    ),

  async execute(interaction) {
    return changeLoaNickname(interaction, "mark-loa", "-LOA");
  },
};
