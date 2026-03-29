const { SlashCommandBuilder } = require("discord.js");
const Reputation = require("../../models/reputation.js");
const { ROLE_ADMIN } = require("../../utils/roles.js");
const { assignRepRoleById } = require("../../utils/assignRepRole.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("subrep")
    .setDescription("Subtract reputation from a user.")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("The user to remove reputation from.")
        .setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName("amount")
        .setDescription("Amount to subtract.")
        .setRequired(true)
    ),

  async execute(interaction) {
    // Permission Check
    if (
      !interaction.member.roles.cache.has(ROLE_ADMIN) &&
      !interaction.member.roles.cache.has("1474372815418425367")
    ) {
      return interaction.reply({
        content: "❌ You do not have permission to use this command.",
        ephemeral: true,
      });
    }

    await interaction.deferReply(); // ✅ Prevents interaction timeout

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

    // ✅ Update role
    await assignRepRoleById(interaction.guild, interaction.channel, target.id);

    return interaction.editReply(
      `✅ Removed **${amount}** reputation from ${target}.\nNew total: **${repRecord.rep}**`
    );
  },
};
