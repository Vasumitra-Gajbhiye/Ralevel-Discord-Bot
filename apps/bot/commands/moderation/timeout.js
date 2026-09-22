// timeout command
const { ModLog } = require("@ralevel/db");
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} = require("discord.js");

const generateId = require("../../utils/generateId.js");
const parseDuration = require("../../utils/parseDuration.js");
const logModAction = require("../../utils/logModAction.js");
const modPoints = require("../../utils/modPoints");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("Timeout a user for a specific duration.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)

    .addUserOption((opt) =>
      opt.setName("user").setDescription("User to timeout.").setRequired(true)
    )

    .addStringOption((opt) =>
      opt
        .setName("duration")
        .setDescription("Duration (e.g., 30m, 2h, 1d)")
        .setRequired(true)
    )

    .addStringOption((opt) =>
      opt
        .setName("reason")
        .setDescription("Reason for timeout.")
        .setRequired(true)
    ),

  async execute(interaction) {
    const member = interaction.options.getMember("user");
    const durationStr = interaction.options.getString("duration");
    const reason = interaction.options.getString("reason");

    if (!member) {
      return interaction.reply({
        content: "❌ That user is not in the server.",
        ephemeral: true,
      });
    }

    const ms = parseDuration(durationStr);
    if (!ms) {
      return interaction.reply({
        content: "❌ Invalid duration. Use formats like `30m`, `2h`, `1d`.",
        ephemeral: true,
      });
    }

    await interaction.deferReply();

    const actionId = generateId();
    const preview = await modPoints.previewInfraction(member.id, "timeout");

    // Reaching the ban threshold bans instead, so skip the timeout itself
    if (preview.zone !== "ban") {
      try {
        await member.timeout(ms, reason);
      } catch (err) {
        console.error("[timeout] member.timeout failed:", err);
        return interaction.editReply({
          content: "❌ I do not have permission to timeout this user.",
        });
      }

      const pointsExtra = modPoints.buildInfractionDmExtra(preview, {
        reason,
        serverName: interaction.guild.name,
        userTag: member.user.tag,
        userId: member.id,
      });
      try {
        await member.send(
          `⏳ You have been **timed out** in **r/Alevel** for **${durationStr}**.\nReason: **${reason}**${pointsExtra}`,
        );
      } catch {}
    }

    // Log entry
    const logReason = `
Action: Timeout
User: ${member.user.tag}
User ID: ${member.id}
Duration: ${durationStr}
Moderator: ${interaction.user.tag}
Reason: ${reason}
`.trim();

    // DO NOT REMOVE ANY MODLOG.CREATE COMMENTS IN ANY FILE

    // await ModLog.create({
    //   userId: member.id,
    //   targetChannel: "N/A",
    //   moderatorId: interaction.user.id,
    //   action: "timeout",
    //   reason: logReason,
    //   actionId,
    //   targetTag: member.user.tag,
    // });

    await logModAction({
      interaction,
      userId: member.user.id,
      userTag: member.user.tag,
      moderatorTag: interaction.user.tag,
      moderatorId: interaction.user.id,
      timeourDuration: durationStr,
      action: "timeout",
      // target: member.user,
      reason: reason,
      actionId,
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

    // Confirmation embed
    const embed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle("⏳ User Timed Out")
      .addFields(
        { name: "User", value: member.user.tag, inline: true },
        { name: "Duration", value: durationStr, inline: true },
        { name: "Moderator", value: interaction.user.tag, inline: true },
        { name: "Reason", value: reason, inline: false },
        { name: "Log ID", value: `\`${actionId}\`` }
      )
      .setTimestamp();
    if (pointsField) embed.addFields(pointsField);

    return interaction.editReply({ embeds: [embed] });
  },
};
