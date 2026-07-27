const { EmbedBuilder } = require("discord.js");

function buildPendingReviewEmbed(app, { userTag, userId, channelName }) {
  const joinedAt = app.joinedAt ?? null;

  return new EmbedBuilder()
    .setTitle("📨 New Certificate Application")
    .setColor("#5865F2")
    .addFields(
      {
        name: "Applicant",
        value: `${userTag} (${userId})`,
        inline: true,
      },
      { name: "Type", value: `${app.type}`, inline: true },
      { name: "Rep", value: `${app.rep ?? 0}`, inline: true },
      {
        name: "Joined",
        value: joinedAt
          ? `<t:${Math.floor(joinedAt.getTime() / 1000)}:R>`
          : "Unknown",
        inline: true,
      },
      {
        name: "Submitted",
        value: `<t:${Math.floor(app.createdAt.getTime() / 1000)}:F>`,
        inline: true,
      },
      { name: "Application ID", value: `\`${app._id}\``, inline: false },
    )
    .setFooter({
      text: channelName
        ? `Submitted in #${channelName}`
        : "Submitted (unknown channel)",
    });
}

function buildResolvedReviewEmbed(app, { decision, moderatorTag, reason }) {
  const joinedAt = app.joinedAt ?? null;
  const isApproved = decision === "approved";

  const embed = new EmbedBuilder()
    .setTitle(
      isApproved
        ? "✅ Certificate Application — Approved"
        : "❌ Certificate Application — Rejected",
    )
    .setColor(isApproved ? "#00B894" : "#ff4d4d")
    .addFields(
      {
        name: "Applicant",
        value: `${app.userTag} (${app.userId})`,
        inline: true,
      },
      { name: "Type", value: `${app.type}`, inline: true },
      { name: "Rep", value: `${app.rep ?? 0}`, inline: true },
      {
        name: "Joined",
        value: joinedAt
          ? `<t:${Math.floor(joinedAt.getTime() / 1000)}:R>`
          : "Unknown",
        inline: true,
      },
      {
        name: "Submitted",
        value: `<t:${Math.floor(app.createdAt.getTime() / 1000)}:F>`,
        inline: true,
      },
      { name: "Application ID", value: `\`${app._id}\``, inline: false },
      {
        name: "Status",
        value: isApproved ? "Approved" : "Rejected",
        inline: true,
      },
      { name: "Moderator", value: moderatorTag, inline: true },
      {
        name: "Resolved",
        value: app.resolvedAt
          ? `<t:${Math.floor(app.resolvedAt.getTime() / 1000)}:F>`
          : "Unknown",
        inline: true,
      },
    )
    .setTimestamp();

  if (!isApproved && reason) {
    embed.addFields({ name: "Reason", value: reason.slice(0, 1024) });
  }

  return embed;
}

function buildResolvedReviewPayload(app, options) {
  return {
    embeds: [buildResolvedReviewEmbed(app, options)],
    components: [],
  };
}

async function updateStoredReviewMessage(
  client,
  app,
  decision,
  moderatorTag,
  reason,
) {
  if (!app.reviewMessageId || !app.reviewChannelId) return;

  try {
    const channel = await client.channels
      .fetch(app.reviewChannelId)
      .catch(() => null);
    if (!channel?.isTextBased?.()) return;

    const message = await channel.messages
      .fetch(app.reviewMessageId)
      .catch(() => null);
    if (!message) return;

    await message.edit(
      buildResolvedReviewPayload(app, { decision, moderatorTag, reason }),
    );
  } catch {
    // Message may have been deleted; don't fail the approve/reject action
  }
}

module.exports = {
  buildPendingReviewEmbed,
  buildResolvedReviewEmbed,
  buildResolvedReviewPayload,
  updateStoredReviewMessage,
};
