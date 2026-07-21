const {
  REMINDER_HOUR_IST,
  getISTDateInfo,
  findActiveRotation,
  getRotationMembers,
  updateRotationCache,
} = require("../utils/qotdHelpers");

// ===== CONFIG =====
const REMINDER_CHANNEL_ID = process.env.QOTD_REMINDER_CHANNEL_ID;
const CHECK_INTERVAL_MS = 5 * 60 * 1000; // every 5 minutes
// ==================

module.exports = function qotdSystem(client) {
  if (!REMINDER_CHANNEL_ID) {
    console.warn(
      "[QOTD] QOTD_REMINDER_CHANNEL_ID is not set — reminders will not send.",
    );
  }

  async function checkAndSendReminder() {
    try {
      if (!client.isReady()) {
        console.log("[QOTD] Skip: Discord client not ready yet.");
        return;
      }

      if (!REMINDER_CHANNEL_ID) {
        console.warn("[QOTD] Skip: QOTD_REMINDER_CHANNEL_ID is missing.");
        return;
      }

      const { dateStr, hour } = getISTDateInfo();

      if (hour < REMINDER_HOUR_IST) {
        console.log(
          `[QOTD] Skip: before ${REMINDER_HOUR_IST} AM IST (currently ${hour}:xx on ${dateStr}).`,
        );
        return;
      }

      const rotation = await findActiveRotation();
      if (!rotation) {
        console.warn(
          "[QOTD] Skip: no active rotation found in MongoDB (check qotdrotations collection).",
        );
        return;
      }

      if (rotation.lastReminderDate === dateStr) {
        console.log(
          `[QOTD] Skip: reminder already sent today (${dateStr}).`,
        );
        return;
      }

      if (!rotation.modOrder?.length) {
        console.warn("[QOTD] Skip: modOrder is empty.");
        return;
      }

      const { current, next, validIndex } = getRotationMembers(rotation);
      if (!validIndex) {
        console.warn(
          `[QOTD] Skip: currentIndex ${rotation.currentIndex} out of bounds (modOrder length ${rotation.modOrder.length}).`,
        );
        return;
      }

      const channel = await client.channels.fetch(REMINDER_CHANNEL_ID);
      if (!channel) {
        console.warn(
          `[QOTD] Skip: channel ${REMINDER_CHANNEL_ID} not found.`,
        );
        return;
      }

      if (!channel.isTextBased()) {
        console.warn(
          `[QOTD] Skip: channel ${REMINDER_CHANNEL_ID} is not text-based.`,
        );
        return;
      }

      const message =
        `🌅 **Question of the Day — Reminder**\n\n` +
        `Today’s QOTD is assigned to:\n` +
        `👉 <@${current.id}>\n\n` +
        `Please post the Question of the Day when ready.\n\n` +
        `🔔 **Next up:** <@${next.id}>\n` +
        `You’re next in rotation — please start preparing.`;

      console.log(
        `[QOTD] ${dateStr} | index=${rotation.currentIndex} | current=${current.id}`,
      );

      await channel.send({
        content: message,
        allowedMentions: {
          users: [current.id, next.id],
        },
      });

      rotation.lastReminderDate = dateStr;
      rotation.currentIndex =
        (rotation.currentIndex + 1) % rotation.modOrder.length;

      await rotation.save();
      updateRotationCache(rotation);
    } catch (err) {
      console.error("QOTD reminder error:", err);
    }
  }

  client.once("ready", () => {
    console.log(
      "[QOTD] Scheduler started (checks every 5 minutes after client ready).",
    );
    setInterval(checkAndSendReminder, CHECK_INTERVAL_MS);
    setTimeout(checkAndSendReminder, 10_000);
  });
};
