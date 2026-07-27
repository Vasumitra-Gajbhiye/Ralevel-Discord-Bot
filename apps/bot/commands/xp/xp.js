const { XpBan } = require("@ralevel/db");
const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const {
  buildXpProfileEmbed,
  getOrCreateUser,
  getServerRank,
  getXpTotalsWithPending,
} = require("../../utils/xp");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("xp")
    .setDescription("Check a member's XP, rank, and progress.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("The member whose XP you want to check.")
        .setRequired(true),
    ),

  async execute(interaction) {
    const target = interaction.options.getUser("user");
    const guildId = interaction.guild.id;

    const user = await getOrCreateUser(guildId, target.id);
    const { xp, totalMessages } = await getXpTotalsWithPending(
      guildId,
      target.id,
      user,
    );
    const serverRank = await getServerRank(guildId, xp);
    const isBanned = Boolean(await XpBan.exists({ userId: target.id }));

    const embed = buildXpProfileEmbed({
      guild: interaction.guild,
      targetUser: target,
      xp,
      totalMessages,
      serverRank,
      isBanned,
    });

    return interaction.reply({ embeds: [embed] });
  },
};
