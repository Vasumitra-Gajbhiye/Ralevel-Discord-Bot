const { RepBan } = require("@ralevel/db");
const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("list-rep-ban")
    .setDescription("List all users who are banned from receiving reputation.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    await interaction.deferReply();

    const bannedUsers = await RepBan.find();

    if (bannedUsers.length === 0) {
      return interaction.editReply("✅ **No users are currently rep-banned.**");
    }

    // Format the list
    const formattedList = bannedUsers
      .map((u, i) => `**${i + 1}.** <@${u.userId}>`)
      .join("\n");

    const embed = new EmbedBuilder()
      .setTitle("🚫 Rep-Banned Users")
      .setDescription(formattedList)
      .setColor("#FF4D4D")
      .setTimestamp()
      .setFooter({ text: "Use /repunban @user to remove bans." });

    return interaction.editReply({ embeds: [embed] });
  },
};
