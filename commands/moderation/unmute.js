const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const ModLog = require("../../models/modlog.js");
const generateActionId = require("../../utils/generateId.js");
const logModAction = require("../../utils/logModAction");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("unmute")
    .setDescription("Remove timeout from a user")
    .addUserOption((option) =>
      option.setName("user").setDescription("User to unmute").setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("Reason for unmuting")
        .setRequired(true)
    ),

  async execute(interaction) {
    const modRoles = process.env.MOD_ROLES_WITH_TRIAL.split(",");
    if (!interaction.member.roles.cache.some((r) => modRoles.includes(r.id))) {
      return interaction.reply({
        content: "❌ You are not allowed to use this command.",
        ephemeral: true,
      });
    }

    const member = interaction.options.getMember("user");
    const reason = interaction.options.getString("reason");

    if (!member) {
      return interaction.reply({
        content: "❌ Could not find that user.",
        ephemeral: true,
      });
    }

    // ❌ Check if user is not muted (no timeout)
    if (!member.isCommunicationDisabled()) {
      const embed = new EmbedBuilder()
        .setTitle("🔊 User Not Muted")
        .setDescription(
          `**${member.user.tag}** is **not currently muted**, so they cannot be unmuted.`
        )
        .setColor("Yellow")
        .setTimestamp();

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // ✅ Remove timeout
    await member.timeout(null, reason).catch(() => {
      return interaction.reply({
        content: "❌ I don't have permission to unmute this user.",
        ephemeral: true,
      });
    });

    // DM user
    try {
      await member.send(
        `🔊 You have been unmuted in **r/Alevel**.\nReason: ${reason}`
      );
    } catch {}

    // Create modlog entry
    const actionId = generateActionId();
    // await ModLog.create({
    //   userId: member.id,
    //   moderatorId: interaction.user.id,
    //   action: "unmute",
    //   targetTag: member.user.tag,
    //   reason,
    //   actionId,
    // });

    await logModAction({
      interaction,
      userId: member.user.id,
      userTag: member.user.tag,
      moderatorTag: interaction.user.tag,
      moderatorId: interaction.user.id,
      action: "unmute",
      reason,
      actionId,
    });

    // Pretty embed for success
    const embed = new EmbedBuilder()
      .setTitle("🔊 User Unmuted")
      .setColor("Green")
      .addFields(
        { name: "User", value: `${member.user.tag}`, inline: true },
        { name: "Reason", value: reason, inline: true },
        { name: "Action ID", value: `\`${actionId}\`` }
      )
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  },
};
