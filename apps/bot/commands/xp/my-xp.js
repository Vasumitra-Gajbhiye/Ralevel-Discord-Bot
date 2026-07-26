const { XpBan } = require("@ralevel/db");
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const {
  getOrCreateUser,
  getRankProgress,
  getServerRank,
  resolveRankDisplayName,
} = require("../../utils/xp");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("my-xp")
    .setDescription("Check your XP, rank, and progress."),

  async execute(interaction) {
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;

    const user = await getOrCreateUser(guildId, userId);
    const xp = user.xp ?? 0;
    const totalMessages = user.total_messages ?? 0;
    const progress = getRankProgress(xp);
    const serverRank = await getServerRank(guildId, xp);
    const rankName = resolveRankDisplayName(
      progress.currentRank,
      interaction.guild,
    );
    const isBanned = Boolean(await XpBan.exists({ userId }));

    const embed = new EmbedBuilder()
      .setTitle(`${interaction.user.username}'s XP`)
      .setThumbnail(interaction.user.displayAvatarURL({ size: 128 }))
      .addFields(
        { name: "Rank", value: `**${rankName}**`, inline: true },
        { name: "Total XP", value: xp.toLocaleString(), inline: true },
        { name: "Messages", value: totalMessages.toLocaleString(), inline: true },
        { name: "Server Rank", value: `#${serverRank}`, inline: true },
        {
          name: "Progress",
          value: progress.nextRank
            ? `${progress.progressBar} ${progress.progressPct}%\n${progress.progressLabel}\n**${progress.xpToNext.toLocaleString()}** XP to next rank`
            : `🏆 ${progress.progressLabel}`,
        },
      )
      .setColor("#00AEEF")
      .setTimestamp();

    if (isBanned) {
      embed.setFooter({ text: "You are banned from earning XP" });
    }

    return interaction.reply({ embeds: [embed] });
  },
};
