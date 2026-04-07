const { SlashCommandBuilder } = require("discord.js");
const Reputation = require("../../models/reputation.js");
const { ROLE_ADMIN } = require("../../utils/roles.js");
const { assignRepRoleById } = require("../../utils/assignRepRole.js");
const logModAction = require("../../utils/logModAction");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("addrep")
    .setDescription("Add reputation to a user.")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("The user to add reputation to.")
        .setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName("amount")
        .setDescription("Amount to add.")
        .setRequired(true)
    ),

  async execute(interaction) {
    // Permission Check
    if (
      !interaction.member.roles.cache.has(ROLE_ADMIN) &&
      !interaction.member.roles.cache.has("1474372815418425367")
    ) {
      console.log("has perm");
      return interaction.reply({
        content: "❌ You do not have permission to use this command.",
        ephemeral: true,
      });
    }

    await interaction.deferReply();

    const target = interaction.options.getUser("user");
    const amount = interaction.options.getInteger("amount");

    // Fetch or create reputation record
    let repRecord = await Reputation.findOne({ userId: target.id });
    if (!repRecord)
      repRecord = await Reputation.create({ userId: target.id, rep: amount });
    else {
      repRecord.rep += amount;
      await repRecord.save();
    }

    // ✅ Update role
    await assignRepRoleById(interaction.guild, interaction.channel, target.id);

    return interaction.editReply(
      `✅ Added **${amount}** reputation to ${target}.\nNew total: **${repRecord.rep}**`
    );
  },
};
