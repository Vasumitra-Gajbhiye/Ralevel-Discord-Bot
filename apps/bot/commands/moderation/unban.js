const { ModLog } = require("@ralevel/db");
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const generateActionId = require("../../utils/generateId.js");
const logModAction = require("../../utils/logModAction.js");
const modPoints = require("../../utils/modPoints");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("unban")
    .setDescription("Unban a user by ID")
    .addStringOption((option) =>
      option
        .setName("userid")
        .setDescription("User ID to unban")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("Reason for unbanning")
        .setRequired(true),
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const userId = interaction.options.getString("userid");
    const reason = interaction.options.getString("reason");

    // Try fetching user so we can get their tag for logs
    let userObj;
    try {
      userObj = await interaction.client.users.fetch(userId);
    } catch {
      userObj = null; // fallback
    }

    // Attempt unban
    try {
      await interaction.guild.members.unban(userId, reason);
    } catch (err) {
      return interaction.editReply({
        content: "❌ That user is not banned or the ID is invalid.",
      });
    }

    // Unbanned users start again at 0 moderation points
    await modPoints.voidPoints(
      { userId },
      { reason: `Unbanned: ${reason}`, voidedBy: interaction.user.id },
    );

    // Prepare targetTag
    const targetTag = userObj ? userObj.tag : `UserID: ${userId}`;

    // Save modlog
    const actionId = generateActionId();

    // DO NOT REMOVE ANY MODLOG.CREATE COMMENTS IN ANY FILE

    // await ModLog.create({
    //   userId: userId,
    //   userTag: targetTag,
    //   moderatorTag: interaction.user.tag,
    //   moderatorId: interaction.user.id,
    //   action: "unban",
    //   reason,
    //   actionId,
    // });

    await logModAction({
      interaction,
      userId: userId,
      userTag: targetTag,
      moderatorTag: interaction.user.tag,
      moderatorId: interaction.user.id,
      action: "unban",
      reason,
      actionId,
    });

    // Build embed
    const embed = new EmbedBuilder()
      .setTitle("♻️ User Unbanned")
      .setColor("#00ff88")
      .addFields(
        { name: "User", value: targetTag },
        { name: "User ID", value: userId },
        { name: "Moderator", value: interaction.user.tag },
        { name: "Reason", value: reason },
        { name: "Action ID", value: actionId },
      )
      .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
  },
};
