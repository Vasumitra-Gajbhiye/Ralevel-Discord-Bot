const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} = require("discord.js");
const ModLog = require("../../models/modlog.js");
const Warning = require("../../models/warning");
const crypto = require("crypto");
const logModAction = require("../../utils/logModAction");

function isModerator(member) {
  const allowedRoles = process.env.MOD_ROLES_WITH_TRIAL.split(",");
  return member.roles.cache.some((role) => allowedRoles.includes(role.id));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Warn a user.")
    .addUserOption((opt) =>
      opt.setName("user").setDescription("User to warn").setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName("reason")
        .setDescription("Reason for warning")
        .setRequired(true)
    ),

  async execute(interaction) {
    if (!isModerator(interaction.member)) {
      return interaction.reply({
        content: "❌ You do not have permission.",
        ephemeral: true,
      });
    }

    const user = interaction.options.getUser("user");
    const reason = interaction.options.getString("reason");

    const actionId = crypto.randomUUID();

    await Warning.create({
      userId: user.id,
      userTag: user.tag,
      moderatorId: interaction.user.id,
      reason,
      actionId,
    });

    // DM the user
    try {
      await user.send(
        `⚠️ You have been warned in **r/Alevel**.\nReason: **${reason}**`
      );
    } catch {
      // ignore if DMs are closed
    }

    // Log action (DB + channel)
    await logModAction({
      interaction,
      userId: user.id,
      userTag: user.tag,
      moderatorTag: interaction.user.tag,
      moderatorId: interaction.user.id,
      action: "warn",
      reason,
      actionId,
    });

    // Confirmation embed
    const embed = new EmbedBuilder()
      .setTitle("User Warned ✅")
      .setColor("Yellow")
      .addFields(
        { name: "User", value: `<@${user.id}>`, inline: true },
        { name: "Reason", value: reason, inline: true },
        { name: "Action ID", value: actionId, inline: false }
      )
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  },
};
