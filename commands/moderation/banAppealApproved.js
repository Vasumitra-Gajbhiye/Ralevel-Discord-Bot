const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} = require("discord.js");
const generateActionId = require("../../utils/generateId.js");
const logModAction = require("../../utils/logModAction");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ban-appeal-approved")
    .setDescription("Approve a user's ban appeal, notify them, and unban them")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("User whose appeal was approved")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("note")
        .setDescription("Optional note to include in the DM to the user")
        .setRequired(false),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  async execute(interaction) {
    await interaction.deferReply();

    const modRoles = [
      ...process.env.MOD_ROLES.split(","),
      "1114477061390733314",
    ];
    if (!interaction.member.roles.cache.some((r) => modRoles.includes(r.id))) {
      return interaction.editReply({
        content: "❌ You cannot use this command.",
        ephemeral: true,
      });
    }

    // Use getUser because banned users are not members of the guild
    const user = interaction.options.getUser("user");
    const note =
      interaction.options.getString("note") || "No additional notes.";

    if (!user) {
      return interaction.editReply({
        content: "❌ User not found.",
        ephemeral: true,
      });
    }

    let dmSuccess = true;

    // 1. Attempt to DM the user BEFORE unbanning (sometimes sharing a mutual ban server allows DMs)
    try {
      await user.send(
        `✅ **Your ban appeal for the r/Alevel Discord server has been APPROVED.**\n\n` +
          `You have been unbanned and may now rejoin the server.\n` +
          `**Moderator Note:** ${note}`,
      );
    } catch {
      dmSuccess = false;
    }

    // 2. Unban the user
    try {
      await interaction.guild.bans.remove(
        user.id,
        `Appeal approved by ${interaction.user.tag}`,
      );
    } catch (error) {
      return interaction.editReply({
        content:
          "❌ Failed to unban the user. They might not be banned, or I lack permissions.",
        ephemeral: true,
      });
    }

    // 3. Log action (DB + channel)
    const actionId = generateActionId();
    await logModAction({
      interaction,
      userId: user.id,
      userTag: user.tag,
      moderatorTag: interaction.user.tag,
      moderatorId: interaction.user.id,
      action: "appeal_approved",
      reason: `Appeal Approved. Note: ${note}`,
      actionId,
    });

    // 4. Respond to moderator
    const embed = new EmbedBuilder()
      .setTitle("✅ Ban Appeal Approved")
      .setColor("#00ff00")
      .addFields(
        { name: "User", value: `${user.tag} (${user.id})` },
        { name: "Moderator", value: interaction.user.tag },
        { name: "Note Sent to User", value: note },
        {
          name: "DM Status",
          value: dmSuccess
            ? "🟢 Delivered"
            : "🔴 Failed (DMs closed or no mutual servers)",
        },
        { name: "Action ID", value: actionId },
      )
      .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
  },
};
