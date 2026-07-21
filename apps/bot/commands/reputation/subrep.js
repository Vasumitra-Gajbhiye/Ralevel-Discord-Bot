const { Reputation } = require("@ralevel/db");
const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { assignRepRoleById } = require("../../utils/assignRepRole.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("sub-rep")
    .setDescription("Subtract reputation from a user.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("The user to remove reputation from.")
        .setRequired(true),
    )
    .addIntegerOption((option) =>
      option
        .setName("amount")
        .setDescription("Amount to subtract.")
        .setRequired(true),
    ),

  async execute(interaction) {
    await interaction.deferReply();
    const target = interaction.options.getUser("user");
    const amount = interaction.options.getInteger("amount");

    // Fetch or create reputation record
    let repRecord = await Reputation.findOne({ userId: target.id });
    if (!repRecord)
      repRecord = await Reputation.create({ userId: target.id, rep: 0 });
    else {
      repRecord.rep = Math.max(0, repRecord.rep - amount); // Never go negative
      await repRecord.save();
    }

    // Update role
    await assignRepRoleById(interaction.guild, interaction.channel, target.id);

    return interaction.editReply(
      `✅ Removed **${amount}** reputation from ${target}.\nNew total: **${repRecord.rep}**`,
    );
  },
};
