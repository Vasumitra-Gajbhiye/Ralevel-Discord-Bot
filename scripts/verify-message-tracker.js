const fs = require("fs");
const path = require("path");
const {
  buildMessageTrackerPipeline,
  MESSAGE_KEY_TTL_SEC,
} = require("../systems/messageTracker");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function createMockMessage(overrides = {}) {
  const boosterRoleId = process.env.BOOSTER_ROLE_ID || "booster-role";
  const hasBoosterRole = overrides.isBooster ?? false;

  return {
    author: { id: overrides.userId || "user-1" },
    guild: { id: overrides.guildId || "guild-1" },
    member: {
      roles: {
        cache: {
          has(roleId) {
            return hasBoosterRole && roleId === boosterRoleId;
          },
        },
      },
    },
    ...overrides,
  };
}

function createMockRedis() {
  let pipelineCalls = 0;
  const commands = [];

  const mockRedis = {
    pipelineCalls: () => pipelineCalls,
    commands: () => commands,
    pipeline() {
      pipelineCalls += 1;
      return {
        hincrby(key, field, increment) {
          commands.push({ op: "hincrby", key, field, increment });
        },
        hset(key, field, value) {
          commands.push({ op: "hset", key, field, value });
        },
        expire(key, ttl) {
          commands.push({ op: "expire", key, ttl });
        },
        async exec() {
          return commands.map(() => [null, 1]);
        },
      };
    },
  };

  return mockRedis;
}

async function withReloadedMessageTracker(setup, run) {
  const messageTrackerPath = require.resolve("../systems/messageTracker");
  const redisModule = require("../redis");
  const savedPipeline = redisModule.pipeline;

  setup(redisModule);
  delete require.cache[messageTrackerPath];
  const reloaded = require("../systems/messageTracker");

  try {
    await run(reloaded);
  } finally {
    redisModule.pipeline = savedPipeline;
    delete require.cache[messageTrackerPath];
    require("../systems/messageTracker");
  }
}

function testNoSequentialDirectRedisCalls() {
  const filePath = path.join(__dirname, "../systems/messageTracker.js");
  const source = fs.readFileSync(filePath, "utf8");

  assert(
    !/await redis\.hincrby/.test(source),
    "messageTracker must not await redis.hincrby directly"
  );
  assert(
    !/await redis\.hset/.test(source),
    "messageTracker must not await redis.hset directly"
  );
  assert(
    /buildMessageTrackerPipeline/.test(source),
    "messageTracker must batch redis writes via pipeline helper"
  );
}

function testBuildMessageTrackerPipelineCommands() {
  const mockRedis = createMockRedis();
  const countKey = "messages:guild-1:2026-06-21";
  const boosterKey = "messages:boosters:guild-1:2026-06-21";

  buildMessageTrackerPipeline(mockRedis, {
    countKey,
    boosterKey,
    userId: "user-42",
    isBooster: true,
  }).exec();

  const commands = mockRedis.commands();
  assert(commands.length === 4, "pipeline should include 4 commands");
  assert(commands[0].op === "hincrby", "first command should be hincrby");
  assert(commands[0].key === countKey, "hincrby should target count key");
  assert(commands[0].field === "user-42", "hincrby should target user field");
  assert(commands[0].increment === 1, "hincrby should increment by 1");

  assert(commands[1].op === "hset", "second command should be hset");
  assert(commands[1].key === boosterKey, "hset should target booster key");
  assert(commands[1].value === "true", "booster flag should be true");

  assert(commands[2].op === "expire", "third command should be expire");
  assert(commands[2].key === countKey, "count key should get TTL");
  assert(commands[2].ttl === MESSAGE_KEY_TTL_SEC, "count key TTL should be 72h");

  assert(commands[3].op === "expire", "fourth command should be expire");
  assert(commands[3].key === boosterKey, "booster key should get TTL");
  assert(
    commands[3].ttl === MESSAGE_KEY_TTL_SEC,
    "booster key TTL should be 72h"
  );
}

async function testHandleMessageTrackerUsesSinglePipeline() {
  const mockRedis = createMockRedis();
  process.env.BOOSTER_ROLE_ID = "booster-role";

  await withReloadedMessageTracker(
    (redisModule) => {
      redisModule.pipeline = mockRedis.pipeline.bind(mockRedis);
    },
    async ({ handleMessageTracker }) => {
      await handleMessageTracker(
        createMockMessage({
          userId: "user-99",
          guildId: "guild-9",
          isBooster: false,
        })
      );

      assert(
        mockRedis.pipelineCalls() === 1,
        "handleMessageTracker should use one pipeline"
      );

      const commands = mockRedis.commands();
      assert(commands.length === 4, "pipeline should batch all four commands");
      assert(
        commands[1].value === "false",
        "non-booster users should be stored as false"
      );
      assert(
        commands[0].key ===
          "messages:guild-9:" + new Date().toISOString().split("T")[0],
        "count key should use guild and today's UTC date"
      );
    }
  );
}

async function testHandleMessageTrackerBoosterFlag() {
  const mockRedis = createMockRedis();
  process.env.BOOSTER_ROLE_ID = "booster-role";

  await withReloadedMessageTracker(
    (redisModule) => {
      redisModule.pipeline = mockRedis.pipeline.bind(mockRedis);
    },
    async ({ handleMessageTracker }) => {
      await handleMessageTracker(createMockMessage({ isBooster: true }));

      const hset = mockRedis.commands().find((cmd) => cmd.op === "hset");
      assert(hset?.value === "true", "booster users should be stored as true");
    }
  );
}

async function main() {
  testNoSequentialDirectRedisCalls();
  testBuildMessageTrackerPipelineCommands();
  await testHandleMessageTrackerUsesSinglePipeline();
  await testHandleMessageTrackerBoosterFlag();

  await require("../redis").quit();

  console.log("verify-message-tracker: all checks passed");
}

main().catch((err) => {
  console.error("verify-message-tracker failed:", err.message);
  process.exit(1);
});
