const {
  fetchLegacyUserHashes,
  buildUserUpdates,
} = require("../utils/dailyFinalize");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function testBuildUserUpdates() {
  const userIds = ["u1", "u2", "u3"];
  const counts = { u1: "10", u2: "5", u3: "3" };
  const boosters = { u1: "true", u2: "false", u3: "true" };
  const userMap = { u1: { _id: "u1", xp: 100 } };

  const { operations, usersForRanking } = buildUserUpdates(
    userIds,
    counts,
    boosters,
    userMap,
    "guild1"
  );

  assert(operations.length === 3, "expected 3 bulkWrite operations");
  assert(usersForRanking.length === 3, "expected 3 ranking entries");

  const u1Rank = usersForRanking.find((entry) => entry.userId === "u1");
  assert(u1Rank.previousXp === 100, "u1 previous XP should come from userMap");
  assert(u1Rank.xp === 120, "u1 XP should be 100 + (10 * 2)");

  const u2Op = operations.find((op) => op.updateOne.filter._id === "u2");
  assert(u2Op.updateOne.update.$inc.xp === 5, "non-booster XP should equal count");
}

async function testFetchLegacyUserHashesUsesPipelineChunks() {
  let pipelineCalls = 0;
  const fakeData = {
    "messages:g1:2026-01-01:u1": { count: "2", booster: "false" },
    "messages:g1:2026-01-01:u2": { count: "4", booster: "true" },
    "messages:g1:2026-01-01:u3": { count: "1", booster: "false" },
  };

  const mockRedis = {
    pipeline() {
      pipelineCalls += 1;
      const commands = [];
      return {
        hgetall(key) {
          commands.push(key);
        },
        async exec() {
          return commands.map((key) => [null, fakeData[key] || {}]);
        },
      };
    },
  };

  const keys = Object.keys(fakeData);
  const originalPipeline = require("../redis").pipeline;

  try {
    require("../redis").pipeline = mockRedis.pipeline.bind(mockRedis);
    const result = await fetchLegacyUserHashes(keys, 50);
    assert(result.size === 3, "legacy fetch should return all user hashes");
    assert(
      result.get(keys[0]).count === "2",
      "legacy fetch should preserve hash fields"
    );
    assert(pipelineCalls === 1, "3 keys should fit in one pipeline chunk");
  } finally {
    require("../redis").pipeline = originalPipeline;
  }
}

async function testFetchLegacyUserHashesChunksLargeSets() {
  let pipelineCalls = 0;
  const keys = Array.from({ length: 120 }, (_, i) => `messages:g1:2026-01-01:u${i}`);

  const mockRedis = {
    pipeline() {
      pipelineCalls += 1;
      const commands = [];
      return {
        hgetall(key) {
          commands.push(key);
        },
        async exec() {
          return commands.map((key) => [null, { count: "1", booster: "false" }]);
        },
      };
    },
  };

  const originalPipeline = require("../redis").pipeline;

  try {
    require("../redis").pipeline = mockRedis.pipeline.bind(mockRedis);
    const result = await fetchLegacyUserHashes(keys, 50);
    assert(result.size === 120, "chunked legacy fetch should return all keys");
    assert(pipelineCalls === 3, "120 keys should require 3 pipeline chunks");
  } finally {
    require("../redis").pipeline = originalPipeline;
  }
}

async function main() {
  testBuildUserUpdates();
  await testFetchLegacyUserHashesUsesPipelineChunks();
  await testFetchLegacyUserHashesChunksLargeSets();
  console.log("✅ finalize redis verification passed");
}

main().catch((err) => {
  console.error("❌ finalize redis verification failed:", err);
  process.exit(1);
});
