const QotdRotation = require("../models/qotdRotation");

const REMINDER_HOUR_IST = 6;

function getISTDateInfo() {
  const now = new Date();
  const istTime = new Date(now.getTime() + (5 * 60 + 30) * 60 * 1000);

  const year = istTime.getUTCFullYear();
  const month = String(istTime.getUTCMonth() + 1).padStart(2, "0");
  const day = String(istTime.getUTCDate()).padStart(2, "0");

  return {
    dateStr: `${year}-${month}-${day}`,
    hour: istTime.getUTCHours(),
  };
}

function findActiveRotation() {
  return QotdRotation.findOne({
    $or: [{ enabled: true }, { enabled: { $exists: false } }],
  });
}

function getRotationMembers(rotation) {
  if (!rotation?.modOrder?.length) {
    return { current: null, next: null, validIndex: false };
  }

  const { currentIndex, modOrder } = rotation;
  const validIndex =
    Number.isInteger(currentIndex) &&
    currentIndex >= 0 &&
    currentIndex < modOrder.length;

  if (!validIndex) {
    return { current: null, next: null, validIndex: false };
  }

  return {
    current: modOrder[currentIndex],
    next: modOrder[(currentIndex + 1) % modOrder.length],
    validIndex: true,
  };
}

function getWouldSendReason({ dateStr, hour, rotation, channelId, clientReady }) {
  if (!clientReady) return "Discord client not ready";
  if (!channelId) return "QOTD_REMINDER_CHANNEL_ID is not set";
  if (!rotation) return "No active rotation in MongoDB";
  if (hour < REMINDER_HOUR_IST) {
    return `Before ${REMINDER_HOUR_IST} AM IST (currently ${hour}:xx on ${dateStr})`;
  }
  if (rotation.lastReminderDate === dateStr) {
    return `Already sent today (${dateStr})`;
  }
  if (!rotation.modOrder?.length) return "modOrder is empty";
  if (!getRotationMembers(rotation).validIndex) {
    return `currentIndex ${rotation.currentIndex} out of bounds`;
  }
  return "Would send now";
}

async function getQotdDiagnostics(client) {
  const channelId = process.env.QOTD_REMINDER_CHANNEL_ID;
  const { dateStr, hour } = getISTDateInfo();
  const rotation = await findActiveRotation();
  const { current, next, validIndex } = getRotationMembers(rotation);
  const clientReady = client?.isReady?.() ?? false;

  let channelStatus = "not checked";
  if (!channelId) {
    channelStatus = "missing env var";
  } else if (!clientReady) {
    channelStatus = "client not ready";
  } else {
    try {
      const channel = await client.channels.fetch(channelId);
      if (!channel) channelStatus = "not found";
      else if (!channel.isTextBased()) channelStatus = "not text-based";
      else channelStatus = `#${channel.name}`;
    } catch {
      channelStatus = "fetch failed";
    }
  }

  return {
    dateStr,
    hour,
    channelId: channelId || null,
    channelStatus,
    clientReady,
    rotationFound: Boolean(rotation),
    enabled: rotation?.enabled ?? null,
    modCount: rotation?.modOrder?.length ?? 0,
    currentIndex: rotation?.currentIndex ?? null,
    lastReminderDate: rotation?.lastReminderDate ?? null,
    current,
    next,
    validIndex,
    wouldSend: getWouldSendReason({
      dateStr,
      hour,
      rotation,
      channelId,
      clientReady,
    }),
  };
}

module.exports = {
  REMINDER_HOUR_IST,
  getISTDateInfo,
  findActiveRotation,
  getRotationMembers,
  getWouldSendReason,
  getQotdDiagnostics,
};
