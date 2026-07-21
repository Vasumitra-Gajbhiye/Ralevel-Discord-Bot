require("../loadEnv");
const { Poll, PollVote } = require("@ralevel/db");

const mongoose = require("mongoose");
const applyPollVote = require("../utils/applyPollVote");

const TEST_POLL_ID = 999_999_999;
const TEST_GUILD_ID = "verify-poll-votes-guild";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function cleanup() {
  await PollVote.deleteMany({ pollId: TEST_POLL_ID });
  await Poll.deleteOne({ pollId: TEST_POLL_ID });
}

async function createTestPoll(choiceType) {
  await Poll.create({
    pollId: TEST_POLL_ID,
    guildId: TEST_GUILD_ID,
    channelId: "verify-channel",
    question: "Verification poll",
    options: [
      { id: "0", label: "Option A" },
      { id: "1", label: "Option B" },
    ],
    allowedRoleIds: ["role1"],
    choiceType,
    status: "active",
    createdBy: "verify-script",
  });
}

async function testConcurrentSingleChoiceVotes() {
  await cleanup();
  await createTestPoll("single");

  const voters = Array.from({ length: 50 }, (_, i) => `user-${i}`);

  await Promise.all(
    voters.map((userId) =>
      applyPollVote({
        pollId: TEST_POLL_ID,
        userId,
        optionId: "0",
        choiceType: "single",
        optionLabel: "Option A",
      }),
    ),
  );

  const count = await PollVote.countDocuments({ pollId: TEST_POLL_ID });
  assert(count === 50, `expected 50 vote documents, got ${count}`);

  const votes = await PollVote.find({ pollId: TEST_POLL_ID }).lean();
  assert(
    votes.every((vote) => vote.optionIds.length === 1 && vote.optionIds[0] === "0"),
    "every concurrent voter should have option 0 selected",
  );
}

async function testSingleChoiceToggle() {
  await cleanup();
  await createTestPoll("single");

  await applyPollVote({
    pollId: TEST_POLL_ID,
    userId: "toggle-user",
    optionId: "0",
    choiceType: "single",
    optionLabel: "Option A",
  });

  let vote = await PollVote.findOne({ pollId: TEST_POLL_ID, userId: "toggle-user" }).lean();
  assert(
    vote.optionIds.length === 1 && vote.optionIds[0] === "0",
    "single-choice vote should be recorded",
  );

  await applyPollVote({
    pollId: TEST_POLL_ID,
    userId: "toggle-user",
    optionId: "0",
    choiceType: "single",
    optionLabel: "Option A",
  });

  vote = await PollVote.findOne({ pollId: TEST_POLL_ID, userId: "toggle-user" }).lean();
  assert(vote.optionIds.length === 0, "single-choice re-click should clear vote");
}

async function testMultipleChoiceToggle() {
  await cleanup();
  await createTestPoll("multiple");

  await applyPollVote({
    pollId: TEST_POLL_ID,
    userId: "multi-user",
    optionId: "0",
    choiceType: "multiple",
    optionLabel: "Option A",
  });

  await applyPollVote({
    pollId: TEST_POLL_ID,
    userId: "multi-user",
    optionId: "1",
    choiceType: "multiple",
    optionLabel: "Option B",
  });

  let vote = await PollVote.findOne({ pollId: TEST_POLL_ID, userId: "multi-user" }).lean();
  assert(
    vote.optionIds.includes("0") && vote.optionIds.includes("1"),
    "multiple-choice vote should include both options",
  );

  await applyPollVote({
    pollId: TEST_POLL_ID,
    userId: "multi-user",
    optionId: "0",
    choiceType: "multiple",
    optionLabel: "Option A",
  });

  vote = await PollVote.findOne({ pollId: TEST_POLL_ID, userId: "multi-user" }).lean();
  assert(
    !vote.optionIds.includes("0") && vote.optionIds.includes("1"),
    "multiple-choice toggle should remove only the selected option",
  );
}

async function main() {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is required to run poll vote verification");
  }

  await mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  try {
    await testConcurrentSingleChoiceVotes();
    await testSingleChoiceToggle();
    await testMultipleChoiceToggle();
    console.log("✅ poll vote verification passed");
  } finally {
    await cleanup();
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error("❌ poll vote verification failed:", err);
  process.exit(1);
});
