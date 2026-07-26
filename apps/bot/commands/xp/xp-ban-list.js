const { XpBan } = require("@ralevel/db");
const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("xp-ban-list")
    .setDescription("List all users banned from earning XP.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    await interaction.deferReply();

    const bannedUsers = await XpBan.find().sort({ createdAt: -1 });

    if (bannedUsers.length === 0) {
      return interaction.editReply(
        "✅ **No users are currently XP-banned.**",
      );
    }

    const formattedList = bannedUsers
      .map((ban, i) => {
        const mention = `<@${ban.userId}>`;
        return ban.reason
          ? `**${i + 1}.** ${mention} — ${ban.reason}`
          : `**${i + 1}.** ${mention}`;
      })
      .join("\n");

    const embed = new EmbedBuilder()
      .setTitle("🚫 XP-Banned Users")
      .setDescription(formattedList)
      .setColor("#FF4D4D")
      .setTimestamp()
      .setFooter({ text: "Use /xp-unban @user to remove bans." });

    return interaction.editReply({ embeds: [embed] });
  },
};
