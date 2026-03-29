const QotdRotation = require("../models/qotdRotation");

// ===== CONFIG =====
const REMINDER_CHANNEL_ID = "1114445623719112724";
const CHECK_INTERVAL_MS = 5 * 60 * 1000; // every 5 minutes
const REMINDER_HOUR_IST = 6; // 6 AM IST
// ==================

// Convert current time to IST date + hour
function getISTDateInfo() {
  const now = new Date();

  // IST = UTC + 5:30
  const istTime = new Date(
    now.getTime() + (5 * 60 + 30) * 60 * 1000
  );

  const year = istTime.getUTCFullYear();
  const month = String(istTime.getUTCMonth() + 1).padStart(2, "0");
  const day = String(istTime.getUTCDate()).padStart(2, "0");

  return {
    dateStr: `${year}-${month}-${day}`, // YYYY-MM-DD
    hour: istTime.getUTCHours(),
  };
}

module.exports = function qotdSystem(client) {
  async function checkAndSendReminder() {
    try {
      const rotation = await QotdRotation.findOne({
        enabled: true,
      });

      if (!rotation) return;

      const { dateStr, hour } = getISTDateInfo();

      // Not time yet
      if (hour < REMINDER_HOUR_IST) return;

      // Already sent today
      if (rotation.lastReminderDate === dateStr) return;

      const channel = await client.channels.fetch(
        REMINDER_CHANNEL_ID
      );
      if (!channel || !channel.isTextBased()) return;

      const current =
        rotation.modOrder[rotation.currentIndex];

      const next =
        rotation.modOrder[
          (rotation.currentIndex + 1) %
            rotation.modOrder.length
        ];

      const message =
        `🌅 **Question of the Day — Reminder**\n\n` +
        `Today’s QOTD is assigned to:\n` +
        `👉 <@${current.id}>\n\n` +
        `Please post the Question of the Day when ready.\n\n` +
        `🔔 **Next up:** <@${next.id}>\n` +
        `You’re next in rotation — please start preparing.`;

        console.log(
  `[QOTD] ${dateStr} | index=${rotation.currentIndex} | current=${current.id}`
);

      await channel.send({
        content: message,
        allowedMentions: {
          users: [current.id, next.id],
        },
      });

      // Mark as sent for today (IST)
      // Mark as sent for today (IST) AND advance rotation
rotation.lastReminderDate = dateStr;
rotation.currentIndex =
  (rotation.currentIndex + 1) % rotation.modOrder.length;

await rotation.save();
    } catch (err) {
      console.error("QOTD reminder error:", err);
    }
  }

  // Run periodically
  setInterval(checkAndSendReminder, CHECK_INTERVAL_MS);

  // Also run once shortly after startup
  setTimeout(checkAndSendReminder, 10_000);
};