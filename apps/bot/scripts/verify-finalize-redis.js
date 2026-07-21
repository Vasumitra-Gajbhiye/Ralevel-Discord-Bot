const { User } = require("@ralevel/db");
const finalizeModule = require("../utils/dailyFinalize");
const {
  fetchLegacyUserHashes,
  buildUserUpdates,
  getFinalizeDate,
  getFinalizeLockKey,
} = finalizeModule;

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

function testFinalizeLockKeyUsesSameDate() {
  const guildId = "guild123";
  const date = getFinalizeDate();
  const lockKey = getFinalizeLockKey(guildId, date);

  assert(
    lockKey === `processed:${guildId}:${date}`,
    "lock key should use processed prefix with guild and finalize date"
  );
  assert(/^\d{4}-\d{2}-\d{2}$/.test(date), "finalize date should be YYYY-MM-DD");
}

function testSchedulerAndFinalizeShareLockKey() {
  const guildId = "guild456";
  const date = "2026-06-20";
  const schedulerKey = getFinalizeLockKey(guildId, date);
  const finalizeKey = getFinalizeLockKey(guildId, date);

  assert(
    schedulerKey === finalizeKey,
    "scheduler and finalize should use the same lock key helper"
  );
  assert(
    schedulerKey === "processed:guild456:2026-06-20",
    "lock key should match expected shape"
  );
}

async function withReloadedFinalize(setup, run) {
  const dailyFinalizePath = require.resolve("../utils/dailyFinalize");
  const databasePath = require.resolve("../database");
  const rankSystemPath = require.resolve("../systems/rankSystem");
  const redisModule = require("../redis");

  const saved = {
    set: redisModule.set,
    hgetall: redisModule.hgetall,
    del: redisModule.del,
    smembers: redisModule.smembers,
    find: User.find,
    bulkWrite: User.bulkWrite,
    database: require.cache[databasePath],
    rankSystem: require.cache[rankSystemPath],
    dailyFinalize: require.cache[dailyFinalizePath],
  };

  setup({ redisModule, User, databasePath, rankSystemPath });

  delete require.cache[dailyFinalizePath];
  const reloadedFinalize = require("../utils/dailyFinalize");

  try {
    await run(reloadedFinalize);
  } finally {
    redisModule.set = saved.set;
    redisModule.hgetall = saved.hgetall;
    redisModule.del = saved.del;
    redisModule.smembers = saved.smembers;
    User.find = saved.find;
    User.bulkWrite = saved.bulkWrite;
    require.cache[databasePath] = saved.database;
    require.cache[rankSystemPath] = saved.rankSystem;
    require.cache[dailyFinalizePath] = saved.dailyFinalize;
  }
}

async function testFinalizeAcquiresLockBeforeWork() {
  const callOrder = [];
  const guildId = "g1";
  process.env.GUILD_ID = guildId;

  await withReloadedFinalize(
    ({ redisModule, User, databasePath, rankSystemPath }) => {
      require.cache[databasePath] = {
        id: databasePath,
        filename: databasePath,
        loaded: true,
        exports: async () => {},
      };
      require.cache[rankSystemPath] = {
        id: rankSystemPath,
        filename: rankSystemPath,
        loaded: true,
        exports: async () => {
          callOrder.push({ op: "handleRanks" });
        },
      };

      redisModule.set = async (...args) => {
        callOrder.push({ op: "set", args });
        return "OK";
      };
      redisModule.hgetall = async (key) => {
        callOrder.push({ op: "hgetall", key });
        if (key.includes("boosters")) return {};
        return { u1: "5" };
      };
      redisModule.del = async (...args) => {
        callOrder.push({ op: "del", args });
      };
      redisModule.smembers = async () => [];

      User.find = async () => [];
      User.bulkWrite = async () => {
        callOrder.push({ op: "bulkWrite" });
      };
    },
    async (reloadedFinalize) => {
      await reloadedFinalize({});

      const setIndex = callOrder.findIndex((entry) => entry.op === "set");
      const hgetallIndex = callOrder.findIndex((entry) => entry.op === "hgetall");
      assert(setIndex !== -1, "finalize should acquire lock with set");
      assert(hgetallIndex !== -1, "finalize should read redis message data");
      assert(setIndex < hgetallIndex, "lock should be acquired before redis reads");
      assert(
        callOrder[setIndex].args[4] === "NX",
        "initial lock acquisition should use SET NX"
      );
    }
  );
}

async function testFinalizeSkipsWhenLockNotAcquired() {
  const callOrder = [];
  const guildId = "g2";
  process.env.GUILD_ID = guildId;

  await withReloadedFinalize(
    ({ redisModule, User, databasePath, rankSystemPath }) => {
      require.cache[databasePath] = {
        id: databasePath,
        filename: databasePath,
        loaded: true,
        exports: async () => {},
      };
      require.cache[rankSystemPath] = {
        id: rankSystemPath,
        filename: rankSystemPath,
        loaded: true,
        exports: async () => {
          callOrder.push({ op: "handleRanks" });
        },
      };

      redisModule.set = async (...args) => {
        callOrder.push({ op: "set", args });
        return args[4] === "NX" ? null : "OK";
      };
      redisModule.hgetall = async (key) => {
        callOrder.push({ op: "hgetall", key });
        return {};
      };

      User.find = async () => [];
      User.bulkWrite = async () => {
        callOrder.push({ op: "bulkWrite" });
      };
    },
    async (reloadedFinalize) => {
      await reloadedFinalize({});

      assert(
        callOrder.length === 1,
        "only lock acquisition should run when lock is held"
      );
      assert(callOrder[0].op === "set", "finalize should attempt lock acquisition");
      assert(
        !callOrder.some((entry) => entry.op === "hgetall"),
        "finalize should not read redis when lock is not acquired"
      );
      assert(
        !callOrder.some((entry) => entry.op === "bulkWrite"),
        "finalize should not write mongo when lock is not acquired"
      );
    }
  );
}

async function main() {
  testBuildUserUpdates();
  testFinalizeLockKeyUsesSameDate();
  testSchedulerAndFinalizeShareLockKey();
  await testFetchLegacyUserHashesUsesPipelineChunks();
  await testFetchLegacyUserHashesChunksLargeSets();
  await testFinalizeAcquiresLockBeforeWork();
  await testFinalizeSkipsWhenLockNotAcquired();
  console.log("✅ finalize redis verification passed");
}

main().catch((err) => {
  console.error("❌ finalize redis verification failed:", err);
  process.exit(1);
});
