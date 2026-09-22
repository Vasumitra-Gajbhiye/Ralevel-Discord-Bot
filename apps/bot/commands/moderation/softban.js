const { ModLog } = require("@ralevel/db");
const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} = require("discord.js");

const generateActionId = require("../../utils/generateId.js");
const logModAction = require("../../utils/logModAction.js");
const modPoints = require("../../utils/modPoints");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("softban")
    .setDescription(
      "Softban a user (ban + unban to delete messages from last 24 hours)",
    )
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("User to softban")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("Reason for softban")
        .setRequired(true),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  async execute(interaction) {
    await interaction.deferReply();

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

    const preview = await modPoints.previewInfraction(member.id, "softban");

    // Reaching the ban threshold bans instead, so skip the softban itself
    if (preview.zone !== "ban") {
      // Try to DM user before banning
      const pointsExtra = modPoints.buildInfractionDmExtra(preview, {
        reason,
        serverName: interaction.guild.name,
        userTag: member.user.tag,
        userId: member.id,
      });
      try {
        await member.send(
          `⛔ You have been **softbanned** from **r/Alevel**.\nReason: ${reason}\nYour recent messages were removed.\nFeel free to rejoin${pointsExtra}`,
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

    await modPoints.recordPoints({
      preview,
      userId: member.id,
      userTag: member.user.tag,
      sourceActionId: actionId,
      moderatorId: interaction.user.id,
      moderatorTag: interaction.user.tag,
      reason,
    });
    const enforcement = await modPoints.enforceThreshold({
      interaction,
      preview,
      user: member.user,
      userId: member.id,
      userTag: member.user.tag,
      reason,
    });
    const pointsField = modPoints.buildPointsField(preview, enforcement);

    // Build Embed
    const embed = new EmbedBuilder()
      .setTitle("🔨 User Softbanned")
      .setColor("Red")
      .addFields(
        { name: "User", value: `${member.user.tag}`, inline: true },
        { name: "Reason", value: reason, inline: true },
        { name: "Action ID", value: `\`${actionId}\`` },
      )
      .setTimestamp();
    if (pointsField) embed.addFields(pointsField);

    return interaction.editReply({ embeds: [embed] });
  },
};
