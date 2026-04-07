const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const ModLog = require("../../models/modlog.js");
const generateActionId = require("../../utils/generateId.js");
const ms = require("ms");
const logModAction = require("../../utils/logModAction");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("mute")
    .setDescription("Timeout a user for a set amount of time")
    .addUserOption((option) =>
      option.setName("user").setDescription("User to timeout").setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("duration")
        .setDescription("Duration (e.g., 10m, 1h, 2d)")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("Reason for timeout")
        .setRequired(true)
    ),

  async execute(interaction) {
    // Permission check
    const modRoles = process.env.MOD_ROLES_WITH_TRIAL.split(",");
    if (!interaction.member.roles.cache.some((r) => modRoles.includes(r.id))) {
      return interaction.reply({
        content: "❌ You are not allowed to use this command.",
        ephemeral: true,
      });
    }

    const member = interaction.options.getMember("user");
    const durationStr = interaction.options.getString("duration");
    const reason = interaction.options.getString("reason");

    if (!member) {
      return interaction.reply({
        content: "❌ User not found.",
        ephemeral: true,
      });
    }

    // Convert duration to ms
    const durationMs = ms(durationStr);
    if (!durationMs) {
      return interaction.reply({
        content:
          "❌ Invalid duration format. Use **10m**, **1h**, **2d**, etc.",
        ephemeral: true,
      });
    }

    // Apply timeout
    try {
      await member.timeout(durationMs, reason);
    } catch (err) {
      console.error(err);
      return interaction.reply({
        content:
          "❌ I do not have permission to mute this user.\n" +
          "Fix this: Move my role **ABOVE** theirs & enable the **Moderate Members** permission.",
        ephemeral: true,
      });
    }

    // DM user (fails silently)
    try {
      await member.send(
        `⏳ You have been muted in **r/Alevel** for **${durationStr}**.\nReason: ${reason}`
      );
    } catch {}

    // Create modlog entry
    const actionId = generateActionId();
    await logModAction({
      interaction,
      userId: member.user.id,
      userTag: member.user.tag,
      moderatorTag: interaction.user.tag,
      moderatorId: interaction.user.id,
      action: "mute",
      reason,
      actionId,
      muteDuration: durationStr,
    });

    // DO NOT REMOVE ANY MODLOG.CREATE COMMENTS IN ANY FILE

    // await ModLog.create({
    //     userId: member.id,
    //     moderatorId: interaction.user.id,
    //     action: "mute",
    //     targetTag: member.user.tag,
    //     reason,
    //     actionId
    // });

    // Build embed
    const embed = new EmbedBuilder()
      .setTitle("🔇 User Muted")
      .setColor("#ff0000")
      .addFields(
        {
          name: "User",
          value: `${member.user.tag} (${member.id})`,
          inline: false,
        },
        { name: "Duration", value: durationStr, inline: true },
        { name: "Reason", value: reason, inline: true },
        { name: "Moderator", value: `${interaction.user.tag}`, inline: false },
        { name: "Action ID", value: `\`${actionId}\`` }
      )
      .setTimestamp()
      .setFooter({ text: "Moderation System • r/Alevel" });

    return interaction.reply({ embeds: [embed] });
  },
};
