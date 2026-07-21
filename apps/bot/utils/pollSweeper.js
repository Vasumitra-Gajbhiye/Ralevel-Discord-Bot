const { Poll } = require("@ralevel/db");
const getPollVotes = require("./getPollVotes");
const {
  buildResultsEmbed,
  buildPollButtons,
} = require("./pollDisplay");

const IDLE_INTERVAL_MS = 5 * 60 * 1000;
const MAX_INTERVAL_MS = 5 * 60 * 1000;
const STARTUP_DELAY_MS = 10_000;
const CLOSE_CONCURRENCY = 5;

let sweepState = null;

function computeNextSweepDelay(now, nextDeadline) {
  if (!nextDeadline) {
    return IDLE_INTERVAL_MS;
  }

  const msUntil = new Date(nextDeadline).getTime() - now;
  if (msUntil <= 0) {
    return 0;
  }

  return Math.min(msUntil, MAX_INTERVAL_MS);
}

async function getNextActiveDeadline() {
  return Poll.findOne({
    status: "active",
    deadline: { $ne: null, $gt: new Date() },
  })
    .sort({ deadline: 1 })
    .select("deadline")
    .lean();
}

async function closePoll(client, poll) {
  if (poll.status === "closed") return;

  poll.status = "closed";
  await poll.save();

  try {
    const channel = await client.channels.fetch(poll.channelId);
    if (!channel?.isTextBased()) return;

    const message = await channel.messages.fetch(poll.messageId);
    const votes = await getPollVotes(poll);
    const embed = buildResultsEmbed(poll, true, votes);
    const components = buildPollButtons(poll, true);

    await message.edit({ embeds: [embed], components });
  } catch (err) {
    console.error(`Failed to close poll #${poll.pollId}:`, err.message);
  }
}

async function closePollsConcurrent(client, polls, concurrency = CLOSE_CONCURRENCY) {
  for (let i = 0; i < polls.length; i += concurrency) {
    const batch = polls.slice(i, i + concurrency);
    await Promise.all(batch.map((poll) => closePoll(client, poll)));
  }
}

async function sweepExpiredPolls(client) {
  const expiredPolls = await Poll.find({
    status: "active",
    deadline: { $ne: null, $lte: new Date() },
  });

  await closePollsConcurrent(client, expiredPolls);
}

async function scheduleNextSweep() {
  if (!sweepState) return;

  const next = await getNextActiveDeadline();
  const delay = computeNextSweepDelay(Date.now(), next?.deadline);

  clearTimeout(sweepState.timer);
  sweepState.timer = setTimeout(() => runSweeper(), delay);
}

async function runSweeper() {
  if (!sweepState) return;

  try {
    await sweepExpiredPolls(sweepState.client);
  } catch (err) {
    console.error("Poll deadline sweeper error:", err);
  } finally {
    await scheduleNextSweep();
  }
}

function startPollSweeper(client) {
  sweepState = { client, timer: null };
  sweepState.timer = setTimeout(() => runSweeper(), STARTUP_DELAY_MS);
}

function wakePollSweeper() {
  if (!sweepState) return;

  clearTimeout(sweepState.timer);
  sweepState.timer = setTimeout(() => runSweeper(), 0);
}

module.exports = {
  IDLE_INTERVAL_MS,
  MAX_INTERVAL_MS,
  STARTUP_DELAY_MS,
  CLOSE_CONCURRENCY,
  computeNextSweepDelay,
  getNextActiveDeadline,
  closePoll,
  sweepExpiredPolls,
  startPollSweeper,
  wakePollSweeper,
};
