const { ModLog, Warning } = require("@ralevel/db");
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} = require("discord.js");
const crypto = require("crypto");
const logModAction = require("../../utils/logModAction");
const modPoints = require("../../utils/modPoints");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Warn a user.")
    .addUserOption((opt) =>
      opt.setName("user").setDescription("User to warn").setRequired(true),
    )
    .addStringOption((opt) =>
      opt
        .setName("reason")
        .setDescription("Reason for warning")
        .setRequired(true),
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const user = interaction.options.getUser("user");
    const reason = interaction.options.getString("reason");

    const actionId = crypto.randomUUID();
    const preview = await modPoints.previewInfraction(user.id, "warn");

    await Warning.create({
      userId: user.id,
      userTag: user.tag,
      moderatorId: interaction.user.id,
      moderatorTag: interaction.user.tag,
      reason,
      actionId,
    });

    // DM the user (the auto-ban sends its own ban DM instead)
    if (preview.zone !== "ban") {
      const pointsExtra = modPoints.buildInfractionDmExtra(preview, {
        reason,
        serverName: interaction.guild.name,
        userTag: user.tag,
        userId: user.id,
      });
      try {
        await user.send(
          `⚠️ You have been warned in **r/Alevel**.\nReason: **${reason}**${pointsExtra}`,
        );
      } catch {
        // ignore if DMs are closed
      }
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

    await modPoints.recordPoints({
      preview,
      userId: user.id,
      userTag: user.tag,
      sourceActionId: actionId,
      moderatorId: interaction.user.id,
      moderatorTag: interaction.user.tag,
      reason,
    });
    const enforcement = await modPoints.enforceThreshold({
      interaction,
      preview,
      user,
      userId: user.id,
      userTag: user.tag,
      reason,
    });
    const pointsField = modPoints.buildPointsField(preview, enforcement);

    // Confirmation embed
    const embed = new EmbedBuilder()
      .setTitle("User Warned ✅")
      .setColor("Yellow")
      .addFields(
        { name: "User", value: `<@${user.id}>`, inline: true },
        { name: "Reason", value: reason, inline: true },
        { name: "Action ID", value: actionId, inline: false },
      )
      .setTimestamp();
    if (pointsField) embed.addFields(pointsField);

    return interaction.editReply({ embeds: [embed] });
  },
};
