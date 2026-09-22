const { ModPoint } = require("@ralevel/db");
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} = require("discord.js");
const mongoose = require("mongoose");

const generateActionId = require("../../utils/generateId.js");
const logModAction = require("../../utils/logModAction.js");
const checkRoleHierarchy = require("../../utils/checkRoleHierarchy.js");
const modPoints = require("../../utils/modPoints");

const MAX_LISTED_ENTRIES = 15;

function formatEntry(entry, config) {
  const created = Math.floor(new Date(entry.createdAt).getTime() / 1000);
  const expiresAt = modPoints.getExpiryDate(entry, config);
  const expiry = expiresAt
    ? ` · expires <t:${Math.floor(expiresAt.getTime() / 1000)}:R>`
    : "";
  const reason =
    entry.reason.length > 80 ? `${entry.reason.slice(0, 77)}…` : entry.reason;
  return `\`${entry._id}\` **+${entry.points}** ${entry.source} · <t:${created}:d>${expiry}\n↳ ${reason}`;
}

async function checkTargetHierarchy(interaction, userId) {
  if (!interaction.guild) return null;
  const targetMember = await interaction.guild.members
    .fetch(userId)
    .catch(() => null);
  return checkRoleHierarchy(interaction, targetMember);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("points")
    .setDescription("View or adjust a user's moderation points.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addSubcommand((sub) =>
      sub
        .setName("view")
        .setDescription("Show a user's active moderation points.")
        .addUserOption((opt) =>
          opt.setName("user").setDescription("User to check").setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("Manually add moderation points to a user.")
        .addUserOption((opt) =>
          opt.setName("user").setDescription("User to add points to").setRequired(true),
        )
        .addIntegerOption((opt) =>
          opt
            .setName("amount")
            .setDescription("Number of points to add")
            .setMinValue(1)
            .setRequired(true),
        )
        .addStringOption((opt) =>
          opt.setName("reason").setDescription("Reason for adding points").setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Remove a single point entry by its ID.")
        .addStringOption((opt) =>
          opt
            .setName("entryid")
            .setDescription("Point entry ID (shown in /points view)")
            .setRequired(true),
        )
        .addStringOption((opt) =>
          opt.setName("reason").setDescription("Reason for removing").setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("reset")
        .setDescription("Remove all of a user's moderation points.")
        .addUserOption((opt) =>
          opt.setName("user").setDescription("User to reset").setRequired(true),
        )
        .addStringOption((opt) =>
          opt.setName("reason").setDescription("Reason for resetting").setRequired(true),
        ),
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const subcommand = interaction.options.getSubcommand();
    const config = modPoints.getPointsConfig();

    if (subcommand === "view") {
      const user = interaction.options.getUser("user");
      const { total, entries } = await modPoints.getActivePoints(user.id, config);

      const listed = entries.slice(0, MAX_LISTED_ENTRIES);
      const more =
        entries.length > listed.length
          ? `\n…and ${entries.length - listed.length} more`
          : "";

      const embed = new EmbedBuilder()
        .setTitle("📊 Moderation Points")
        .setColor(total >= config.threshold - config.noticeDistance ? "Red" : "Blue")
        .addFields(
          { name: "User", value: `<@${user.id}>`, inline: true },
          {
            name: "Total",
            value: `**${total}/${config.threshold}**`,
            inline: true,
          },
          {
            name: "Ban notice at",
            value: `${config.threshold - config.noticeDistance}+`,
            inline: true,
          },
          {
            name: "Active entries",
            value: listed.length
              ? listed.map((entry) => formatEntry(entry, config)).join("\n") + more
              : "None",
          },
        )
        .setTimestamp();

      if (!config.enabled) {
        embed.setFooter({ text: "The point system is currently disabled." });
      }

      return interaction.editReply({ embeds: [embed] });
    }

    if (subcommand === "add") {
      const user = interaction.options.getUser("user");
      const amount = interaction.options.getInteger("amount");
      const reason = interaction.options.getString("reason");

      if (!config.enabled) {
        return interaction.editReply({
          content: "❌ The point system is disabled. Enable it in the dashboard first.",
        });
      }

      const hierarchyError = await checkTargetHierarchy(interaction, user.id);
      if (hierarchyError) {
        return interaction.editReply({ content: hierarchyError.message });
      }

      const actionId = generateActionId();
      const preview = await modPoints.previewInfraction(user.id, "manual", {
        points: amount,
      });

      if (preview.zone === "notice") {
        const notice = modPoints.buildInfractionDmExtra(preview, {
          reason,
          serverName: interaction.guild.name,
          userTag: user.tag,
          userId: user.id,
        });
        try {
          await user.send(notice.trim());
        } catch {}
      }

      await modPoints.recordPoints({
        preview,
        userId: user.id,
        userTag: user.tag,
        sourceActionId: actionId,
        moderatorId: interaction.user.id,
        moderatorTag: interaction.user.tag,
        reason,
      });

      await logModAction({
        interaction,
        userId: user.id,
        userTag: user.tag,
        moderatorTag: interaction.user.tag,
        moderatorId: interaction.user.id,
        action: "points-add",
        reason: `+${amount} points: ${reason}`,
        actionId,
      });

      const enforcement = await modPoints.enforceThreshold({
        interaction,
        preview,
        user,
        userId: user.id,
        userTag: user.tag,
        reason,
      });

      const embed = new EmbedBuilder()
        .setTitle("➕ Points Added")
        .setColor("Orange")
        .addFields(
          { name: "User", value: `<@${user.id}>`, inline: true },
          { name: "Reason", value: reason, inline: true },
          modPoints.buildPointsField(preview, enforcement),
          { name: "Action ID", value: actionId },
        )
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    }

    if (subcommand === "remove") {
      const entryId = interaction.options.getString("entryid").trim();
      const reason = interaction.options.getString("reason");

      if (!mongoose.isValidObjectId(entryId)) {
        return interaction.editReply({ content: "❌ Invalid entry ID." });
      }

      const entry = await ModPoint.findById(entryId).lean();
      if (!entry) {
        return interaction.editReply({ content: "❌ No point entry found with that ID." });
      }
      if (!entry.active) {
        return interaction.editReply({ content: "❌ This point entry is already removed." });
      }

      const hierarchyError = await checkTargetHierarchy(interaction, entry.userId);
      if (hierarchyError) {
        return interaction.editReply({ content: hierarchyError.message });
      }

      await modPoints.voidPoints(
        { _id: entry._id },
        { reason, voidedBy: interaction.user.id },
      );
      const { total } = await modPoints.getActivePoints(entry.userId, config);

      await logModAction({
        interaction,
        userId: entry.userId,
        userTag: entry.userTag || entry.userId,
        moderatorTag: interaction.user.tag,
        moderatorId: interaction.user.id,
        action: "points-remove",
        reason: `-${entry.points} points (${entry.source}, entry ${entryId}): ${reason}`,
        actionId: generateActionId(),
      });

      return interaction.editReply(
        `🗑️ Removed **${entry.points}** points from <@${entry.userId}>. New total: **${total}/${config.threshold}**.`,
      );
    }

    if (subcommand === "reset") {
      const user = interaction.options.getUser("user");
      const reason = interaction.options.getString("reason");

      const hierarchyError = await checkTargetHierarchy(interaction, user.id);
      if (hierarchyError) {
        return interaction.editReply({ content: hierarchyError.message });
      }

      const count = await modPoints.voidPoints(
        { userId: user.id },
        { reason, voidedBy: interaction.user.id },
      );

      await logModAction({
        interaction,
        userId: user.id,
        userTag: user.tag,
        moderatorTag: interaction.user.tag,
        moderatorId: interaction.user.id,
        action: "points-reset",
        reason,
        actionId: generateActionId(),
      });

      return interaction.editReply(
        `🧹 Reset moderation points for <@${user.id}> (${count} entries removed).`,
      );
    }
  },
};
