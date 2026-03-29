const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} = require("discord.js");

const ModLog = require("../../models/modlog.js");
const generateId = require("../../utils/generateId.js");
const parseDuration = require("../../utils/parseDuration.js");
const logModAction = require("../../utils/logModAction.js");

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

    // Role/hierarchy check
    if (!member.moderatable) {
      return interaction.reply({
        content: "❌ I cannot timeout this user due to role hierarchy.",
        ephemeral: true,
      });
    }

    // Apply timeout
    await member.timeout(ms, reason).catch(() => {});

    const actionId = generateId();

    // Log entry
    const logReason = `
Action: Timeout
User: ${member.user.tag}
User ID: ${member.id}
Duration: ${durationStr}
Moderator: ${interaction.user.tag}
Reason: ${reason}
`.trim();

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

    return interaction.reply({ embeds: [embed] });
  },
};
