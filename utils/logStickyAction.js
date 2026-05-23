const StickyLog = require("../models/stickyLog");

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