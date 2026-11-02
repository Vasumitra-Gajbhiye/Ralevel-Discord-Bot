const { Reputation } = require("@ralevel/db");
const { assignRepRoleById } = require("../../utils/assignRepRole");
require("../../loadEnv");

module.exports = {
  // Mounted as /rep-admin set by rep-admin.js
  subcommand: (subcommand) => subcommand
    .setName("set")
    .setDescription("Set a user's reputation to a specific value.")
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
