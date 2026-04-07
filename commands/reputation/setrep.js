const { SlashCommandBuilder } = require("discord.js");
const Reputation = require("../../models/reputation.js");
const { assignRepRoleById } = require("../../utils/assignRepRole");
require("dotenv").config();

module.exports = {
  data: new SlashCommandBuilder()
    .setName("setrep")
    .setDescription("Set a user's reputation to a specific value.")
    .addUserOption((o) =>
      o.setName("user").setDescription("The user.").setRequired(true)
    )
    .addIntegerOption((o) =>
      o
        .setName("amount")
        .setDescription("The reputation value to set.")
        .setRequired(true)
    ),

  async execute(interaction) {
    if (
      !interaction.member.roles.cache.has(process.env.ADMIN_ROLE_ID) &&
      !interaction.member.roles.cache.has("1474372815418425367")
    ) {
      return interaction.reply({
        content: "❌ You do not have permission.",
        ephemeral: true,
      });
    }

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
      `✅ Set **${target}**'s reputation to **${amount}**.`
    );
  },
};
