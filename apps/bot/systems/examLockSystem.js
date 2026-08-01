const { ExamPaper, ModLog } = require("@ralevel/db");
const { EmbedBuilder } = require("discord.js");
const { lockChannel, unlockChannel } = require("../utils/channelLock");
const { getChannelId } = require("../utils/guildConfigStore");
const generateId = require("../utils/generateId");

const IDLE_INTERVAL_MS = 60 * 1000;
const MAX_INTERVAL_MS = 60 * 1000;
const STARTUP_DELAY_MS = 10_000;
const CONCURRENCY = 3;

let sweepState = null;

function computeNextSweepDelay(now, nextAt) {
  if (!nextAt) return IDLE_INTERVAL_MS;
  const msUntil = new Date(nextAt).getTime() - now;
  if (msUntil <= 0) return 0;
  return Math.min(msUntil, MAX_INTERVAL_MS);
}

function formatUnlockUtc(date) {
  return new Date(date).toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC");
}

async function getNextExamEventAt() {
  const now = new Date();

  const [nextLock, nextUnlock, forceUnlock] = await Promise.all([
    ExamPaper.findOne({
      status: "scheduled",
      lockAt: { $ne: null },
    })
      .sort({ lockAt: 1 })
      .select("lockAt")
      .lean(),
    ExamPaper.findOne({
      status: "locked",
      forceUnlock: { $ne: true },
      unlockAt: { $ne: null },
    })
      .sort({ unlockAt: 1 })
      .select("unlockAt")
      .lean(),
    ExamPaper.findOne({
      status: "locked",
      forceUnlock: true,
    })
      .select("_id")
      .lean(),
  ]);

  if (forceUnlock) return now;

  const candidates = [];
  if (nextLock?.lockAt) candidates.push(new Date(nextLock.lockAt).getTime());
  if (nextUnlock?.unlockAt) candidates.push(new Date(nextUnlock.unlockAt).getTime());
  if (candidates.length === 0) return null;
  return new Date(Math.min(...candidates));
}

/**
 * True if another locked/scheduled paper still covers this channel at `now`.
 */
async function channelStillCovered(channelId, excludingPaperId, now) {
  const covering = await ExamPaper.find({
    _id: { $ne: excludingPaperId },
    channelIds: channelId,
    status: { $in: ["locked", "scheduled"] },
  }).lean();

  const t = now.getTime();

  for (const paper of covering) {
    if (paper.status === "locked") {
      if (paper.forceUnlock) continue;
      if (new Date(paper.unlockAt).getTime() > t) return true;
      continue;
    }

    // scheduled: keep locked if its window contains now (about to be locked / mid-window)
    const lockAt = new Date(paper.lockAt).getTime();
    const unlockAt = new Date(paper.unlockAt).getTime();
    if (lockAt <= t && t < unlockAt) return true;
  }

  return false;
}

async function logExamAction(client, {
  action,
  channel,
  paper,
  reason,
}) {
  const actionId = generateId();
  const botUser = client.user;
  const moderatorId = botUser?.id || "bot";
  const moderatorTag = botUser?.tag || "Exam Lock System";

  try {
    await ModLog.create({
      userId: "N/A",
      moderatorId,
      moderatorTag,
      action,
      targetTag: "Everyone",
      reason,
      actionId,
      channelTag: channel?.name || "unknown",
      channelId: channel?.id || "unknown",
      timestamp: new Date(),
    });
  } catch (err) {
    console.error("[exam-lock] Failed to save ModLog:", err.message);
  }

  const logChannelId = getChannelId("modLog");
  if (!logChannelId) {
    console.error("[exam-lock] modLog channel is not set in GuildConfig");
    return actionId;
  }

  try {
    const logChannel = await client.channels.fetch(logChannelId);
    if (!logChannel?.isTextBased?.() && !logChannel?.send) return actionId;

    const prettyAction = action
      .split("-")
      .map((w) => w[0].toUpperCase() + w.slice(1))
      .join(" ");

    const embed = new EmbedBuilder()
      .setTitle(`🔒 ${prettyAction}`)
      .setColor(action.includes("unlock") ? 0x57f287 : 0xff0000)
      .addFields(
        { name: "Paper", value: paper.label },
        { name: "Slot", value: `${paper.date} ${paper.slot}` },
        {
          name: "Channel",
          value: channel
            ? `#${channel.name} (${channel.id})`
            : String(channel?.id || "unknown"),
        },
        { name: "Moderator", value: moderatorTag },
        { name: "Reason", value: reason },
        { name: "Action ID", value: actionId },
      )
      .setTimestamp();

    await logChannel.send({ embeds: [embed] });
  } catch (err) {
    console.error("[exam-lock] Failed to post mod log:", err.message);
  }

  return actionId;
}

async function fetchTextChannel(client, channelId) {
  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel || !channel.permissionOverwrites) return null;
    return channel;
  } catch (err) {
    console.error(`[exam-lock] Failed to fetch channel ${channelId}:`, err.message);
    return null;
  }
}

async function applyLock(client, paper) {
  const reason = `Exam lock: ${paper.label} (${paper.date} ${paper.slot})`;
  const unlockText = formatUnlockUtc(paper.unlockAt);

  for (const channelId of paper.channelIds) {
    const channel = await fetchTextChannel(client, channelId);
    if (!channel) continue;

    try {
      await lockChannel(channel);
    } catch (err) {
      console.error(`[exam-lock] lock failed for ${channelId}:`, err.message);
      continue;
    }

    try {
      const embed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle("Channel locked for exams")
        .setDescription(
          `This channel is locked for **${paper.label}** (${paper.date} ${paper.slot}).\n` +
            `Ordinary members cannot send messages until **${unlockText}**.`,
        )
        .setTimestamp();
      await channel.send({ embeds: [embed] });
    } catch (err) {
      console.error(`[exam-lock] notice failed for ${channelId}:`, err.message);
    }

    await logExamAction(client, {
      action: "exam-lock-channel",
      channel,
      paper,
      reason,
    });
  }

  paper.status = "locked";
  paper.lockedAt = new Date();
  paper.forceUnlock = false;
  await paper.save();
}

async function applyUnlock(client, paper, { forced = false } = {}) {
  const reason = forced
    ? `Exam force unlock: ${paper.label} (${paper.date} ${paper.slot})`
    : `Exam unlock: ${paper.label} (${paper.date} ${paper.slot})`;
  const now = new Date();

  for (const channelId of paper.channelIds) {
    const stillCovered = await channelStillCovered(channelId, paper._id, now);
    const channel = await fetchTextChannel(client, channelId);

    if (!stillCovered && channel) {
      try {
        await unlockChannel(channel);
      } catch (err) {
        console.error(`[exam-lock] unlock failed for ${channelId}:`, err.message);
      }

      try {
        const embed = new EmbedBuilder()
          .setColor(0x57f287)
          .setTitle("Channel unlocked")
          .setDescription(
            `**${paper.label}** (${paper.date} ${paper.slot}) is over. You can discuss again.`,
          )
          .setTimestamp();
        await channel.send({ embeds: [embed] });
      } catch (err) {
        console.error(`[exam-lock] unlock notice failed for ${channelId}:`, err.message);
      }
    } else if (stillCovered) {
      console.log(
        `[exam-lock] Skipping Discord unlock for ${channelId} — still covered by another paper`,
      );
    }

    if (channel) {
      await logExamAction(client, {
        action: forced ? "exam-force-unlock-channel" : "exam-unlock-channel",
        channel,
        paper,
        reason: stillCovered
          ? `${reason} (Discord unlock skipped — overlapping paper)`
          : reason,
      });
    }
  }

  if (paper.cancelAfterUnlock) {
    paper.status = "cancelled";
  } else {
    paper.status = "unlocked";
  }
  paper.unlockedAt = now;
  paper.forceUnlock = false;
  paper.cancelAfterUnlock = false;
  await paper.save();
}

async function processDueLocks(client, now) {
  const due = await ExamPaper.find({
    status: "scheduled",
    lockAt: { $lte: now },
  });

  for (let i = 0; i < due.length; i += CONCURRENCY) {
    const batch = due.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (paper) => {
        try {
          // If unlock already passed (bot was down), skip lock and mark unlocked/cancelled
          if (new Date(paper.unlockAt).getTime() <= now.getTime()) {
            paper.status = "unlocked";
            paper.unlockedAt = now;
            await paper.save();
            console.log(
              `[exam-lock] Skipped past window for ${paper.label} (${paper._id})`,
            );
            return;
          }
          await applyLock(client, paper);
        } catch (err) {
          console.error(`[exam-lock] process lock ${paper._id}:`, err.message);
        }
      }),
    );
  }
}

async function processDueUnlocks(client, now) {
  const due = await ExamPaper.find({
    status: "locked",
    $or: [{ forceUnlock: true }, { unlockAt: { $lte: now } }],
  });

  for (let i = 0; i < due.length; i += CONCURRENCY) {
    const batch = due.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (paper) => {
        try {
          await applyUnlock(client, paper, { forced: Boolean(paper.forceUnlock) });
        } catch (err) {
          console.error(`[exam-lock] process unlock ${paper._id}:`, err.message);
        }
      }),
    );
  }
}

/**
 * Startup: lock any scheduled papers whose window is active now.
 */
async function reconcileActiveWindows(client, now) {
  const active = await ExamPaper.find({
    status: "scheduled",
    lockAt: { $lte: now },
    unlockAt: { $gt: now },
  });

  for (const paper of active) {
    try {
      await applyLock(client, paper);
    } catch (err) {
      console.error(`[exam-lock] reconcile lock ${paper._id}:`, err.message);
    }
  }
}

async function sweepExamLocks(client) {
  const now = new Date();
  // Locks first so overlapping scheduled windows are applied before unlocks.
  await processDueLocks(client, now);
  await processDueUnlocks(client, now);
}

async function scheduleNextSweep() {
  if (!sweepState) return;

  const next = await getNextExamEventAt();
  const delay = computeNextSweepDelay(Date.now(), next);

  clearTimeout(sweepState.timer);
  sweepState.timer = setTimeout(() => runSweeper(), delay);
}

async function runSweeper() {
  if (!sweepState) return;

  try {
    await sweepExamLocks(sweepState.client);
  } catch (err) {
    console.error("[exam-lock] sweeper error:", err);
  } finally {
    await scheduleNextSweep();
  }
}

function startExamLockSystem(client) {
  sweepState = { client, timer: null };

  sweepState.timer = setTimeout(async () => {
    try {
      await reconcileActiveWindows(client, new Date());
      await sweepExamLocks(client);
    } catch (err) {
      console.error("[exam-lock] startup reconcile error:", err);
    } finally {
      await scheduleNextSweep();
    }
  }, STARTUP_DELAY_MS);

  console.log("[exam-lock] Exam lock system started");
}

function wakeExamLockSystem() {
  if (!sweepState) return;
  clearTimeout(sweepState.timer);
  sweepState.timer = setTimeout(() => runSweeper(), 0);
}

module.exports = startExamLockSystem;
module.exports.startExamLockSystem = startExamLockSystem;
module.exports.wakeExamLockSystem = wakeExamLockSystem;
module.exports.sweepExamLocks = sweepExamLocks;
module.exports.channelStillCovered = channelStillCovered;
module.exports.computeNextSweepDelay = computeNextSweepDelay;
module.exports.getNextExamEventAt = getNextExamEventAt;
module.exports.applyLock = applyLock;
module.exports.applyUnlock = applyUnlock;
module.exports.IDLE_INTERVAL_MS = IDLE_INTERVAL_MS;
module.exports.MAX_INTERVAL_MS = MAX_INTERVAL_MS;
