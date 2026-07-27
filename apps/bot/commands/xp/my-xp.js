const { XpBan } = require("@ralevel/db");
const { SlashCommandBuilder } = require("discord.js");
const {
  buildXpProfileEmbed,
  getOrCreateUser,
  getServerRank,
  getXpTotalsWithPending,
} = require("../../utils/xp");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("my-xp")
    .setDescription("Check your XP, rank, and progress."),

  async execute(interaction) {
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;

    const user = await getOrCreateUser(guildId, userId);
    const { xp, totalMessages } = await getXpTotalsWithPending(
      guildId,
      userId,
      user,
    );
    const serverRank = await getServerRank(guildId, xp);
    const isBanned = Boolean(await XpBan.exists({ userId }));

    const embed = buildXpProfileEmbed({
      guild: interaction.guild,
      targetUser: interaction.user,
      xp,
      totalMessages,
      serverRank,
      isBanned,
      selfView: true,
    });

    return interaction.reply({ embeds: [embed] });
  },
};
