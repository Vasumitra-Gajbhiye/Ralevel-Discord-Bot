const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");

const { changeLoaNickname } = require("../../utils/loaNickname.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("mark-partial-loa")
    .setDescription("Mark a user as on partial leave of absence (adds -PLOA to their nickname).")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames)

    .addUserOption((opt) =>
      opt
        .setName("user")
        .setDescription("User to mark as partial LOA.")
        .setRequired(true)
    ),

  async execute(interaction) {
    return changeLoaNickname(interaction, "mark-partial-loa", "-PLOA");
  },
};
