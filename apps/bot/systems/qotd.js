const { DEFAULT_QOTD_REMINDER_TEMPLATE } = require("@ralevel/db");
const { renderMessageTemplate } = require("@ralevel/shared");
const {
  getReminderHourIst,
  getISTDateInfo,
  findActiveRotation,
  getRotationMembers,
  updateRotationCache,
} = require("../utils/qotdHelpers");
const {
  getChannelId,
  tryGetGuildConfig,
} = require("../utils/guildConfigStore");

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // every 5 minutes
const DISCORD_CONTENT_LIMIT = 2000;

function resolveReminderTemplate(cfg) {
  const stored = cfg?.qotd?.reminderTemplate;
  if (typeof stored === "string" && stored.trim()) return stored;
  return DEFAULT_QOTD_REMINDER_TEMPLATE;
}

module.exports = function qotdSystem(client) {
  async function checkAndSendReminder() {
    try {
      const cfg = tryGetGuildConfig();
      if (cfg?.features?.qotd === false) return;

      if (!client.isReady()) {
        console.log("[QOTD] Skip: Discord client not ready yet.");
        return;
      }

      const reminderChannelId = getChannelId("qotdReminder");
      if (!reminderChannelId) {
        console.warn("[QOTD] Skip: qotdReminder channel is missing.");
        return;
      }

      const { dateStr, hour } = getISTDateInfo();
      const reminderHour = getReminderHourIst();

      if (hour < reminderHour) {
        console.log(
          `[QOTD] Skip: before ${reminderHour} AM IST (currently ${hour}:xx on ${dateStr}).`,
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

      const template = resolveReminderTemplate(cfg);
      const message = renderMessageTemplate(template, {
        currentMention: `<@${current.id}>`,
        nextMention: `<@${next.id}>`,
        currentTag: current.tag || current.id,
        nextTag: next.tag || next.id,
        currentId: current.id,
        nextId: next.id,
        date: dateStr,
      });

      if (!message.trim()) {
        console.warn("[QOTD] Skip: reminder template rendered empty.");
        return;
      }

      if (message.length > DISCORD_CONTENT_LIMIT) {
        console.warn(
          `[QOTD] Skip: rendered reminder is ${message.length} characters (limit ${DISCORD_CONTENT_LIMIT}).`,
        );
        return;
      }

      const channel = await client.channels.fetch(reminderChannelId);
      if (!channel) {
        console.warn(
          `[QOTD] Skip: channel ${reminderChannelId} not found.`,
        );
        return;
      }

      if (!channel.isTextBased()) {
        console.warn(
          `[QOTD] Skip: channel ${reminderChannelId} is not text-based.`,
        );
        return;
      }

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
