require("dotenv").config();

const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const Poll = require("../models/poll");
const {
  IDLE_INTERVAL_MS,
  MAX_INTERVAL_MS,
  computeNextSweepDelay,
  getNextActiveDeadline,
  sweepExpiredPolls,
} = require("../utils/pollSweeper");

const TEST_POLL_ID_EXPIRED = 999_999_998;
const TEST_POLL_ID_FUTURE = 999_999_997;
const TEST_GUILD_ID = "verify-poll-sweeper-guild";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function testPollsSourceDoesNotUseFixedInterval() {
  const pollsPath = path.join(__dirname, "../systems/polls.js");
  const source = fs.readFileSync(pollsPath, "utf8");

  assert(
    !source.includes("setInterval"),
    "systems/polls.js must not use setInterval for the sweeper",
  );
  assert(
    !source.includes("60 * 1000"),
    "systems/polls.js must not use a 60-second sweeper interval",
  );
}

function testComputeNextSweepDelay() {
  const now = Date.now();

  assert(
    computeNextSweepDelay(now, new Date(now - 1000)) === 0,
    "overdue deadline should schedule immediate sweep",
  );

  assert(
    computeNextSweepDelay(now, new Date(now + 2 * 60 * 60 * 1000)) ===
      MAX_INTERVAL_MS,
    "deadline 2h away should cap at MAX_INTERVAL_MS",
  );

  assert(
    computeNextSweepDelay(now, new Date(now + 30 * 1000)) === 30 * 1000,
    "deadline 30s away should schedule in 30s",
  );

  assert(
    computeNextSweepDelay(now, null) === IDLE_INTERVAL_MS,
    "no deadline should use IDLE_INTERVAL_MS",
  );
}

function createMockClient() {
  return {
    channels: {
      fetch: async () => ({
        isTextBased: () => true,
        messages: {
          fetch: async () => ({
            edit: async () => {},
          }),
        },
      }),
    },
  };
}

async function cleanup() {
  await Poll.deleteMany({
    pollId: { $in: [TEST_POLL_ID_EXPIRED, TEST_POLL_ID_FUTURE] },
  });
}

async function testSweepExpiredPolls() {
  await cleanup();

  await Poll.create({
    pollId: TEST_POLL_ID_EXPIRED,
    guildId: TEST_GUILD_ID,
    channelId: "verify-channel",
    messageId: "verify-message",
    question: "Expired verification poll",
    options: [
      { id: "0", label: "Option A" },
      { id: "1", label: "Option B" },
    ],
    allowedRoleIds: ["role1"],
    choiceType: "single",
    status: "active",
    deadline: new Date(Date.now() - 60 * 1000),
    createdBy: "verify-script",
  });

  await sweepExpiredPolls(createMockClient());

  const poll = await Poll.findOne({ pollId: TEST_POLL_ID_EXPIRED }).lean();
  assert(poll?.status === "closed", "expired active poll should be closed by sweeper");
}

async function testGetNextActiveDeadline() {
  await cleanup();

  const futureDeadline = new Date(Date.now() + 2 * 60 * 60 * 1000);

  await Poll.create({
    pollId: TEST_POLL_ID_FUTURE,
    guildId: TEST_GUILD_ID,
    channelId: "verify-channel",
    messageId: "verify-message-future",
    question: "Future verification poll",
    options: [
      { id: "0", label: "Option A" },
      { id: "1", label: "Option B" },
    ],
    allowedRoleIds: ["role1"],
    choiceType: "single",
    status: "active",
    deadline: futureDeadline,
    createdBy: "verify-script",
  });

  const next = await getNextActiveDeadline();
  assert(next?.deadline, "getNextActiveDeadline should return nearest active deadline");
  assert(
    new Date(next.deadline).getTime() === futureDeadline.getTime(),
    "getNextActiveDeadline should return the soonest future deadline",
  );
}

async function main() {
  testPollsSourceDoesNotUseFixedInterval();
  testComputeNextSweepDelay();

  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is required to run poll sweeper verification");
  }

  await mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  try {
    await testSweepExpiredPolls();
    await testGetNextActiveDeadline();
    console.log("✅ poll sweeper verification passed");
  } finally {
    await cleanup();
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error("❌ poll sweeper verification failed:", err);
  process.exit(1);
});
