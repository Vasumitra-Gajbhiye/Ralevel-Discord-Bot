const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

const ModLog = require("../../models/modlog.js");
const generateActionId = require("../../utils/generateId.js");
const logModAction = require("../../utils/logModAction.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("softban")
    .setDescription(
      "Softban a user (ban + unban to delete messages from last 24 hours)"
    )
    .addUserOption((option) =>
      option.setName("user").setDescription("User to softban").setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("Reason for softban")
        .setRequired(true)
    ),

  async execute(interaction) {
    await interaction.deferReply();
    const modRoles = process.env.MOD_ROLES.split(",");

    // Permission check
    if (!interaction.member.roles.cache.some((r) => modRoles.includes(r.id))) {
      return interaction.editReply({
        content: "❌ You do not have permission to use this command.",
        flags: 64,
      });
    }

    const member = interaction.options.getMember("user");
    const reason = interaction.options.getString("reason");

    if (!member) {
      return interaction.editReply({
        content: "❌ User not found.",
        flags: 64,
      });
    }

    // Cannot softban yourself or the bot
    if (member.id === interaction.user.id) {
      return interaction.editReply({
        content: "❌ You cannot softban yourself.",
        flags: 64,
      });
    }

    if (member.id === interaction.client.user.id) {
      return interaction.editReply({
        content: "❌ You cannot softban the bot.",
        flags: 64,
      });
    }

    // Try to DM user before banning
    try {
      await member.send(
        `⛔ You have been **softbanned** from **r/Alevel**.\nReason: ${reason}\nYour recent messages were removed.\nFeel free to rejoin`
      );
    } catch {}

    // Try banning
    try {
      await interaction.guild.members.ban(member.id, {
        deleteMessageSeconds: 60 * 60 * 24, // 24 hours
        reason: `Softban: ${reason}`,
      });

      // Immediately unban for softban behavior
      await interaction.guild.members.unban(member.id, "Softban unban step");
    } catch (err) {
      console.error(err);
      return interaction.editReply({
        content:
          "❌ I do not have permission to softban this user.\nMove my role above theirs and enable **Ban Members** permission.",
        flags: 64,
      });
    }

    // Store log in DB
    const actionId = generateActionId();

    await logModAction({
      interaction,
      userId: member.user.id,
      userTag: member.user.tag,
      moderatorTag: interaction.user.tag,
      moderatorId: interaction.user.id,
      action: "softban",
      target: member,
      reason,
      actionId,
      // extra: {
      //   targetTag: member.user.tag,
      // },
    });

    // Build Embed
    const embed = new EmbedBuilder()
      .setTitle("🔨 User Softbanned")
      .setColor("Red")
      .addFields(
        { name: "User", value: `${member.user.tag}`, inline: true },
        { name: "Reason", value: reason, inline: true },
        { name: "Action ID", value: `\`${actionId}\`` }
      )
      .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
  },
};
