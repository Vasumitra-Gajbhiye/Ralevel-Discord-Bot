const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const ModLog = require("../../models/modlog.js");
const generateActionId = require("../../utils/generateId.js");
const logModAction = require("../../utils/logModAction.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("unban")
    .setDescription("Unban a user by ID")
    .addStringOption((option) =>
      option
        .setName("userid")
        .setDescription("User ID to unban")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("Reason for unbanning")
        .setRequired(true)
    ),

  async execute(interaction) {
    // const modRoles = process.env.MOD_ROLES.split(",");
    // if (!interaction.member.roles.cache.some(r => modRoles.includes(r.id))) {
    //     return interaction.reply({ content: "❌ You cannot use this command.", ephemeral: true });
    // }

    const REQUIRED_ROLE = process.env.ADMIN_ROLE_ID;

    if (!interaction.member.roles.cache.has(REQUIRED_ROLE)) {
      return interaction.reply({
        content: "❌ You cannot use this command.",
        ephemeral: true,
      });
    }

    // const modRoles = [
    //   ...process.env.MOD_ROLES.split(","),
    //   "1114477061390733314",
    // ];
    // if (!interaction.member.roles.cache.some((r) => modRoles.includes(r.id))) {
    //   return interaction.editReply({
    //     content: "❌ You cannot use this command.",
    //     ephemeral: true,
    //   });
    // }

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
      return interaction.reply({
        content: "❌ That user is not banned or the ID is invalid.",
        ephemeral: true,
      });
    }

    // Prepare targetTag
    const targetTag = userObj ? userObj.tag : `UserID: ${userId}`;

    // Save modlog
    const actionId = generateActionId();
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
        { name: "Action ID", value: actionId }
      )
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  },
};
