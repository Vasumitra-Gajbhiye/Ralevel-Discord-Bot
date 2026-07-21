const { StickyLog } = require("@ralevel/db");

async function logStickyAction({
  guildId,
  channelId,
  moderator,
  action,
  content = null,
  lineThreshold = null,
}) {
  try {
    await StickyLog.create({
      guildId,
      channelId,
      moderatorId: moderator.id,
      moderatorTag: moderator.tag,
      action,
      content,
      lineThreshold,
    });
  } catch (err) {
    console.error("Sticky log error:", err);
  }
}

module.exports = logStickyAction;