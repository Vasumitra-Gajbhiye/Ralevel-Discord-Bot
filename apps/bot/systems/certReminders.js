const {
  getCertificatesHourIst,
  getISTDateInfo,
  istCalendarAgeDays,
  findCertRotation,
  shouldSendAdminRoleReminder,
  getRoleId,
  Certificate,
  CertRotation,
} = require("../utils/certHelpers");
const {
  getChannelId,
  tryGetGuildConfig,
} = require("../utils/guildConfigStore");

const CHECK_INTERVAL_MS = 5 * 60 * 1000;

module.exports = function certRemindersSystem(client) {
  async function processAppReminder(app, age, adminRoleId, reviewChannel) {
    const now = new Date();
    let changed = false;

    if (age >= 3 && !app.reminder3SentAt && app.assignedAdminId) {
      const content =
        `<@${app.assignedAdminId}> — Certificate application \`${app._id}\` ` +
        `(${app.userTag}, ${app.type}) is still undelivered (**day 3 reminder**, age ${age}d).`;
      await sendReminder(reviewChannel, app, content, {
        users: [app.assignedAdminId],
      });
      app.reminder3SentAt = now;
      changed = true;
    }

    if (age >= 7 && !app.reminder7SentAt && app.assignedAdminId) {
      const content =
        `<@${app.assignedAdminId}> — Certificate application \`${app._id}\` ` +
        `(${app.userTag}, ${app.type}) is still undelivered (**day 7 reminder**, age ${age}d).`;
      await sendReminder(reviewChannel, app, content, {
        users: [app.assignedAdminId],
      });
      app.reminder7SentAt = now;
      changed = true;
    }

    if (shouldSendAdminRoleReminder(age, app.lastAdminReminderDay) && adminRoleId) {
      const content =
        `<@&${adminRoleId}> — Certificate application \`${app._id}\` ` +
        `(${app.userTag}, ${app.type}) is still undelivered (**day ${age}** escalation).` +
        (app.assignedAdminId ? ` Assigned: <@${app.assignedAdminId}>` : "");
      await sendReminder(reviewChannel, app, content, {
        roles: [adminRoleId],
        users: app.assignedAdminId ? [app.assignedAdminId] : [],
      });
      app.lastAdminReminderSentAt = now;
      app.lastAdminReminderDay = age;
      changed = true;
    }

    if (changed) {
      await app.save();
    }
  }

  async function sendReminder(fallbackChannel, app, content, allowedMentions) {
    let channel = fallbackChannel;
    if (app.reviewChannelId) {
      const stored = await client.channels
        .fetch(app.reviewChannelId)
        .catch(() => null);
      if (stored?.isTextBased?.()) channel = stored;
    }
    if (!channel?.isTextBased?.()) return;

    const payload = { content, allowedMentions };

    if (app.reviewMessageId) {
      try {
        const message = await channel.messages.fetch(app.reviewMessageId);
        await message.reply(payload);
        return;
      } catch {
        // Fall through to channel send if reply target is gone
      }
    }

    await channel.send(payload);
  }

  async function checkAndSendReminders() {
    try {
      const cfg = tryGetGuildConfig();
      if (cfg?.features?.certificates === false) return;

      if (!client.isReady()) {
        console.log("[CertReminders] Skip: Discord client not ready yet.");
        return;
      }

      const guildId = process.env.GUILD_ID;
      if (!guildId) {
        console.warn("[CertReminders] Skip: GUILD_ID is not set.");
        return;
      }

      const { dateStr, hour } = getISTDateInfo();
      const reminderHour = getCertificatesHourIst();

      if (hour < reminderHour) {
        console.log(
          `[CertReminders] Skip: before ${reminderHour}:00 IST (currently ${hour}:xx on ${dateStr}).`,
        );
        return;
      }

      let rotation = await findCertRotation(guildId);
      if (rotation?.lastReminderDate === dateStr) {
        console.log(
          `[CertReminders] Skip: already ran today (${dateStr}).`,
        );
        return;
      }

      const reviewChannelId = getChannelId("review");
      if (!reviewChannelId) {
        console.warn("[CertReminders] Skip: review channel is missing.");
        return;
      }

      const reviewChannel = await client.channels
        .fetch(reviewChannelId)
        .catch(() => null);
      if (!reviewChannel?.isTextBased?.()) {
        console.warn("[CertReminders] Skip: review channel not usable.");
        return;
      }

      const adminRoleId = getRoleId("admin");
      const apps = await Certificate.find({
        status: {
          $nin: ["rejected", "completed and delivered"],
        },
      });

      console.log(
        `[CertReminders] ${dateStr} | checking ${apps.length} open application(s)`,
      );

      for (const app of apps) {
        try {
          const age = istCalendarAgeDays(app.createdAt);
          if (age < 3) continue;
          await processAppReminder(app, age, adminRoleId, reviewChannel);
        } catch (err) {
          console.error(
            `[CertReminders] Failed for app ${app._id}:`,
            err,
          );
        }
      }

      if (rotation) {
        rotation.lastReminderDate = dateStr;
        await rotation.save();
      } else {
        // Persist daily guard even when assignees list has not been created yet
        await CertRotation.findOneAndUpdate(
          { guildId },
          {
            $set: { lastReminderDate: dateStr },
            $setOnInsert: {
              guildId,
              assignees: [],
              currentIndex: 0,
              enabled: true,
            },
          },
          { upsert: true },
        );
      }
    } catch (err) {
      console.error("[CertReminders] error:", err);
    }
  }

  client.once("ready", () => {
    console.log(
      "[CertReminders] Scheduler started (checks every 5 minutes after client ready).",
    );
    setInterval(checkAndSendReminders, CHECK_INTERVAL_MS);
    setTimeout(checkAndSendReminders, 15_000);
  });
};
