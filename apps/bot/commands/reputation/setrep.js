const { Reputation } = require("@ralevel/db");
const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { assignRepRoleById } = require("../../utils/assignRepRole");
require("../../loadEnv");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("set-rep")
    .setDescription("Set a user's reputation to a specific value.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addUserOption((o) =>
      o.setName("user").setDescription("The user.").setRequired(true),
    )
    .addIntegerOption((o) =>
      o
        .setName("amount")
        .setDescription("The reputation value to set.")
        .setRequired(true),
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const target = interaction.options.getUser("user");
    const amount = interaction.options.getInteger("amount");

    let rec = await Reputation.findOne({ userId: target.id });
    if (!rec) rec = await Reputation.create({ userId: target.id, rep: amount });
    else {
      rec.rep = amount;
      await rec.save();
    }

    await assignRepRoleById(interaction.guild, interaction.channel, target.id);

    return interaction.editReply(
      `✅ Set **${target}**'s reputation to **${amount}**.`,
    );
  },
};
