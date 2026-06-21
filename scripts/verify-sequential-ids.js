require("dotenv").config();

const mongoose = require("mongoose");
const Counter = require("../models/counter");
const { getNextSequenceId } = require("../utils/getNextSequenceId");

const TEST_COUNTER_NAME = "verify-seq-test";
const CONCURRENT_CALLS = 100;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function cleanup() {
  await Counter.deleteOne({ _id: TEST_COUNTER_NAME });
}

async function testConcurrentSequenceIds() {
  await cleanup();

  const ids = await Promise.all(
    Array.from({ length: CONCURRENT_CALLS }, () =>
      getNextSequenceId(TEST_COUNTER_NAME),
    ),
  );

  assert(
    ids.length === CONCURRENT_CALLS,
    `expected ${CONCURRENT_CALLS} IDs, got ${ids.length}`,
  );

  const uniqueIds = new Set(ids);
  assert(
    uniqueIds.size === CONCURRENT_CALLS,
    `expected ${CONCURRENT_CALLS} unique IDs, got ${uniqueIds.size}`,
  );

  const sorted = [...uniqueIds].sort((a, b) => a - b);
  for (let i = 0; i < CONCURRENT_CALLS; i++) {
    assert(
      sorted[i] === i + 1,
      `expected contiguous IDs 1..${CONCURRENT_CALLS}, got ${sorted.join(",")}`,
    );
  }
}

async function main() {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is required to run sequential ID verification");
  }

  await mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  try {
    await testConcurrentSequenceIds();
    console.log("✅ sequential ID verification passed");
  } finally {
    await cleanup();
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error("❌ sequential ID verification failed:", err);
  process.exit(1);
});
