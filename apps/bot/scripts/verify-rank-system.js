const handleRanks = require("../systems/rankSystem");
const {
  getRank,
  filterRankChanges,
  RANK_UPDATE_CONCURRENCY,
} = require("../systems/rankSystem");
const { buildDefaultGuildConfig } = require("@ralevel/db");
const { setGuildConfig } = require("../utils/guildConfigStore");

function setupTestGuildConfig() {
  const config = buildDefaultGuildConfig("guild1");
  const levelUp = config.channels.find((channel) => channel.key === "levelUp");
  if (levelUp) {
    levelUp.channelId = "level-up-channel";
  }
  setGuildConfig(config);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function testGetRankBoundaries() {
  assert(getRank(0).xp === 0, "0 XP should map to base rank");
  assert(
    getRank(19).roleKey === getRank(0).roleKey,
    "19 XP should stay at base rank",
  );
  assert(getRank(20).xp === 20, "20 XP should reach second rank");
  assert(
    getRank(99).roleKey === getRank(20).roleKey,
    "99 XP should stay at second rank",
  );
  assert(getRank(100).xp === 100, "100 XP should reach third rank");
  assert(getRank(100000).xp === 100000, "100000 XP should reach max rank");
}

function testFilterRankChanges() {
  const users = [
    { userId: "u1", previousXp: 0, xp: 25 },
    { userId: "u2", previousXp: 20, xp: 30 },
    { userId: "u3", previousXp: 90, xp: 110 },
  ];

  const changes = filterRankChanges(users);

  assert(changes.length === 2, "only users with rank changes should remain");
  assert(
    changes.some((entry) => entry.userId === "u1"),
    "u1 should rank up from 0 to 25 XP"
  );
  assert(
    !changes.some((entry) => entry.userId === "u2"),
    "u2 should be excluded (same rank at 20 and 30 XP)"
  );
  assert(
    changes.some((entry) => entry.userId === "u3"),
    "u3 should rank up from 90 to 110 XP"
  );
}

function createMockClient(userIds) {
  let inFlight = 0;
  let maxInFlight = 0;

  const stats = {
    memberFetch: 0,
    roleRemove: 0,
    roleAdd: 0,
    channelSend: 0,
  };

  const members = new Map(
    userIds.map((userId) => [
      userId,
      {
        roles: {
          remove: async () => {
            stats.roleRemove += 1;
            await delay(10);
          },
          add: async () => {
            stats.roleAdd += 1;
            await delay(10);
          },
        },
      },
    ])
  );

  const guild = {
    channels: {
      fetch: async () => ({
        send: async () => {
          stats.channelSend += 1;
          await delay(10);
        },
      }),
    },
    members: {
      fetch: async (userId) => {
        stats.memberFetch += 1;
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);

        await delay(20);

        inFlight -= 1;

        return members.get(userId) || null;
      },
    },
    roles: {
      cache: {
        get: () => ({ name: "Test Rank" }),
      },
    },
  };

  const client = {
    guilds: {
      fetch: async () => guild,
    },
    __test: {
      get maxInFlight() {
        return maxInFlight;
      },
      stats,
    },
  };

  return client;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function testHandleRanksUsesBoundedConcurrency() {
  const userCount = 12;
  const users = Array.from({ length: userCount }, (_, i) => ({
    userId: `u${i}`,
    previousXp: 0,
    xp: 25,
  }));

  const client = createMockClient(users.map((user) => user.userId));

  await handleRanks(client, "guild1", users);

  assert(
    client.__test.stats.memberFetch === userCount,
    "each rank-changed user should trigger one member fetch"
  );
  assert(
    client.__test.stats.roleRemove === userCount,
    "each rank-changed user should trigger role remove"
  );
  assert(
    client.__test.stats.roleAdd === userCount,
    "each rank-changed user should trigger role add"
  );
  assert(
    client.__test.stats.channelSend === userCount,
    "each rank-changed user should trigger one announcement"
  );
  assert(
    client.__test.maxInFlight <= RANK_UPDATE_CONCURRENCY,
    `concurrency should stay at or below ${RANK_UPDATE_CONCURRENCY}`
  );
  assert(
    client.__test.maxInFlight > 1,
    "multiple users should be processed in parallel within a batch"
  );
}

async function testHandleRanksSkipsUnchangedUsers() {
  const users = [
    { userId: "u1", previousXp: 0, xp: 25 },
    { userId: "u2", previousXp: 20, xp: 30 },
    { userId: "u3", previousXp: 90, xp: 110 },
  ];

  const client = createMockClient(["u1", "u3"]);
  await handleRanks(client, "guild1", users);

  assert(
    client.__test.stats.memberFetch === 2,
    "only rank-changed users should trigger Discord API calls"
  );
  assert(
    client.__test.stats.channelSend === 2,
    "only rank-changed users should receive announcements"
  );
}

async function testHandleRanksNoOpWhenNoChanges() {
  const users = [
    { userId: "u1", previousXp: 20, xp: 30 },
    { userId: "u2", previousXp: 100, xp: 150 },
  ];

  let guildFetched = false;
  const client = {
    guilds: {
      fetch: async () => {
        guildFetched = true;
        return {};
      },
    },
  };

  await handleRanks(client, "guild1", users);
  assert(!guildFetched, "guild fetch should be skipped when no rank changes");
}

async function main() {
  setupTestGuildConfig();
  testGetRankBoundaries();
  testFilterRankChanges();
  await testHandleRanksUsesBoundedConcurrency();
  await testHandleRanksSkipsUnchangedUsers();
  await testHandleRanksNoOpWhenNoChanges();
  console.log("✅ rank system verification passed");
}

main().catch((err) => {
  console.error("❌ rank system verification failed:", err);
  process.exit(1);
});
