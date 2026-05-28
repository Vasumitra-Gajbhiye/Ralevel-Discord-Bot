const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const HelperRole = require("../../models/helperRole");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("sethelper")
    .setDescription("Assign a helper role to this channel.")
    .addRoleOption((option) =>
      option.setName("role").setDescription("Helper role").setRequired(true),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction) {
    const role = interaction.options.getRole("role");
    const channelId = interaction.channel.id;

    await HelperRole.findOneAndUpdate(
      { channelId },
      { roleId: role.id },
      { upsert: true },
    );

    interaction.reply(
      `✅ Helper for **#${interaction.channel.name}** is now **${role.name}**`,
    );
  },
};
