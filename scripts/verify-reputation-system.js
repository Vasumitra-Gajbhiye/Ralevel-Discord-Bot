const { PermissionsBitField } = require("discord.js");
const { createBoundedSet } = require("../utils/boundedSet.js");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function createQueryTracker() {
  const counts = {
    repBanExists: 0,
    repBanFind: 0,
    reputationFindOneAndUpdate: 0,
    reputationBulkWrite: 0,
    reputationFind: 0,
  };

  const repBans = new Set();
  const reps = new Map();

  const RepBan = {
    exists: async ({ userId }) => {
      counts.repBanExists += 1;
      return repBans.has(userId) ? { _id: userId } : null;
    },
    find: (query) => ({
      select: () => ({
        lean: async () => {
          counts.repBanFind += 1;
          const ids = query.userId?.$in || [];
          return ids.filter((id) => repBans.has(id)).map((userId) => ({ userId }));
        },
      }),
    }),
  };

  const Reputation = {
    findOneAndUpdate: async (filter, update) => {
      counts.reputationFindOneAndUpdate += 1;
      const current = reps.get(filter.userId) ?? 0;
      const next = current + (update.$inc?.rep ?? 0);
      reps.set(filter.userId, next);
      return { userId: filter.userId, rep: next };
    },
    bulkWrite: async (ops) => {
      counts.reputationBulkWrite += 1;
      for (const op of ops) {
        const userId = op.updateOne.filter.userId;
        const current = reps.get(userId) ?? 0;
        reps.set(userId, current + (op.updateOne.update.$inc?.rep ?? 0));
      }
      return { ok: 1 };
    },
    find: (query) => ({
      select: () => ({
        lean: async () => {
          counts.reputationFind += 1;
          const ids = query.userId?.$in || [];
          return ids.map((userId) => ({
            userId,
            rep: reps.get(userId) ?? 0,
          }));
        },
      }),
    }),
  };

  return { counts, repBans, reps, RepBan, Reputation };
}

function loadReputationWithMocks(tracker) {
  const repBanPath = require.resolve("../models/repban.js");
  const reputationPath = require.resolve("../models/reputation.js");
  const systemPath = require.resolve("../systems/reputation.js");

  require.cache[repBanPath] = {
    id: repBanPath,
    filename: repBanPath,
    loaded: true,
    exports: tracker.RepBan,
  };
  require.cache[reputationPath] = {
    id: reputationPath,
    filename: reputationPath,
    loaded: true,
    exports: tracker.Reputation,
  };
  delete require.cache[systemPath];

  return require("../systems/reputation.js");
}

function createMockGuild(member) {
  return {
    members: {
      me: {
        permissions: {
          has: (flag) => flag === PermissionsBitField.Flags.ManageRoles,
        },
      },
      fetch: async (id) => (id === member.id ? member : null),
    },
  };
}

function createMockMember(id) {
  return {
    id,
    partial: false,
    roles: {
      remove: async () => {},
      add: async () => {},
    },
    toString: () => `<@${id}>`,
  };
}

async function testIncrementReputationQueryCount() {
  const tracker = createQueryTracker();
  const reputation = loadReputationWithMocks(tracker);

  const rep = await reputation.incrementReputation("user-1");

  assert(rep === 1, "incrementReputation should return new rep total");
  assert(
    tracker.counts.repBanExists === 1,
    `expected 1 RepBan.exists call, got ${tracker.counts.repBanExists}`
  );
  assert(
    tracker.counts.reputationFindOneAndUpdate === 1,
    `expected 1 findOneAndUpdate call, got ${tracker.counts.reputationFindOneAndUpdate}`
  );
  assert(
    tracker.counts.repBanFind === 0,
    "single-user path should not use RepBan.find"
  );
}

async function testIncrementReputationSkipsBannedUser() {
  const tracker = createQueryTracker();
  tracker.repBans.add("banned-user");
  const reputation = loadReputationWithMocks(tracker);

  const rep = await reputation.incrementReputation("banned-user");

  assert(rep === null, "banned user should not receive rep");
  assert(
    tracker.counts.reputationFindOneAndUpdate === 0,
    "banned user should not trigger reputation write"
  );
}

async function testIncrementReputationBatchQueryCount() {
  const tracker = createQueryTracker();
  tracker.reps.set("user-1", 4);
  tracker.reps.set("user-2", 9);
  tracker.reps.set("user-3", 0);
  const reputation = loadReputationWithMocks(tracker);

  const awards = await reputation.incrementReputationBatch([
    "user-1",
    "user-2",
    "user-3",
  ]);

  assert(awards.length === 3, "all eligible users should be awarded");
  assert(
    tracker.counts.repBanFind === 1,
    `expected 1 RepBan.find call, got ${tracker.counts.repBanFind}`
  );
  assert(
    tracker.counts.reputationBulkWrite === 1,
    `expected 1 bulkWrite call, got ${tracker.counts.reputationBulkWrite}`
  );
  assert(
    tracker.counts.reputationFind === 1,
    `expected 1 Reputation.find call, got ${tracker.counts.reputationFind}`
  );
  assert(
    tracker.counts.repBanExists === 0,
    "batch path should not use RepBan.exists"
  );
}

async function testIncrementReputationBatchExcludesBanned() {
  const tracker = createQueryTracker();
  tracker.repBans.add("user-2");
  const reputation = loadReputationWithMocks(tracker);

  const awards = await reputation.incrementReputationBatch([
    "user-1",
    "user-2",
    "user-3",
  ]);

  assert(awards.length === 2, "banned user should be excluded from awards");
  assert(
    !awards.some((entry) => entry.userId === "user-2"),
    "banned user should not appear in batch results"
  );
}

async function testEnsureTierRoleUsesPassedRepWithoutDb() {
  const tracker = createQueryTracker();
  const reputation = loadReputationWithMocks(tracker);
  const member = createMockMember("user-1");
  const guild = createMockGuild(member);

  const added = await reputation.ensureTierRoleAndCheckAdded(
    guild,
    member,
    null,
    10
  );

  assert(added === true, "tier role should be added at 10 rep");
  assert(
    tracker.counts.repBanExists === 0 &&
      tracker.counts.repBanFind === 0 &&
      tracker.counts.reputationFindOneAndUpdate === 0 &&
      tracker.counts.reputationBulkWrite === 0 &&
      tracker.counts.reputationFind === 0,
    "ensureTierRoleAndCheckAdded should not query MongoDB when rep is passed"
  );
}

async function testMentionHandlerSendsOneMessage() {
  const tracker = createQueryTracker();
  const reputationSystem = loadReputationWithMocks(tracker);
  const handleReputationMessage = reputationSystem({});

  let sendCount = 0;
  const channel = {
    send: async () => {
      sendCount += 1;
    },
  };

  const members = new Map([
    ["user-1", createMockMember("user-1")],
    ["user-2", createMockMember("user-2")],
    ["user-3", createMockMember("user-3")],
  ]);

  await handleReputationMessage({
    id: "msg-mentions",
    content: "thanks @user-1 @user-2 @user-3",
    author: { id: "author-1" },
    reference: null,
    guild: createMockGuild(createMockMember("author-1")),
    channel,
    mentions: { members },
    fetchReference: async () => null,
  });

  assert(sendCount === 1, `expected 1 channel message, got ${sendCount}`);
  assert(
    tracker.counts.repBanFind === 1 &&
      tracker.counts.reputationBulkWrite === 1 &&
      tracker.counts.reputationFind === 1,
    "mention handler should use batched DB operations"
  );
}

async function testDuplicateMessageIsIgnored() {
  const tracker = createQueryTracker();
  const reputationSystem = loadReputationWithMocks(tracker);
  const handleReputationMessage = reputationSystem({});

  let sendCount = 0;
  const channel = {
    send: async () => {
      sendCount += 1;
    },
  };
  const target = createMockMember("user-1");

  const message = {
    id: "msg-dup",
    content: "thanks",
    author: { id: "author-1" },
    reference: { messageId: "prev-msg" },
    guild: createMockGuild(target),
    channel,
    member: createMockMember("author-1"),
    fetchReference: async () => ({
      member: target,
    }),
  };

  await handleReputationMessage(message);
  await handleReputationMessage(message);

  assert(sendCount === 1, `expected 1 channel message, got ${sendCount}`);
  assert(
    tracker.counts.reputationFindOneAndUpdate === 1,
    `expected 1 findOneAndUpdate call, got ${tracker.counts.reputationFindOneAndUpdate}`
  );
}

function testBoundedSetEvictsOldest() {
  const cache = createBoundedSet(3);

  cache.add("a");
  cache.add("b");
  cache.add("c");
  cache.add("d");

  assert(cache.size === 3, `expected cache size 3, got ${cache.size}`);
  assert(!cache.has("a"), "oldest entry should be evicted");
  assert(cache.has("d"), "newest entry should remain");
}

async function main() {
  await testIncrementReputationQueryCount();
  await testIncrementReputationSkipsBannedUser();
  await testIncrementReputationBatchQueryCount();
  await testIncrementReputationBatchExcludesBanned();
  await testEnsureTierRoleUsesPassedRepWithoutDb();
  await testMentionHandlerSendsOneMessage();
  await testDuplicateMessageIsIgnored();
  testBoundedSetEvictsOldest();

  console.log("verify-reputation-system: all checks passed");
}

main().catch((err) => {
  console.error("verify-reputation-system failed:", err.message);
  process.exit(1);
});
