const { EventEmitter } = require("events");
const { PermissionsBitField } = require("discord.js");
const realDb = require("@ralevel/db");
const { setGuildConfig } = require("../utils/guildConfigStore");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

// Collections delete-my-data must never touch.
const PROTECTED_MODELS = [
  "ModLog",
  "Warning",
  "VerbalWarning",
  "ModPoint",
  "Note",
  "Kick",
  "ModmailTicket",
  "ModmailBan",
  "ModmailMessageLink",
  "ModDm",
  "Confession",
  "ConfessionBan",
  "ConfessionReply",
  "Certificate",
  "XpBan",
  "RepBan",
];

function setupTestGuildConfig() {
  const config = realDb.buildDefaultGuildConfig("guild1");
  for (const role of config.roles) {
    if (role.key === "rank1") role.roleId = "role-rank1";
    if (role.key === "rank2") role.roleId = "role-rank2";
    if (role.key === "beginner") role.roleId = "role-beginner";
  }
  setGuildConfig(config);
}

function createTracker() {
  const touched = [];
  const privacyDocs = new Map();
  const repBans = new Set();
  const reps = new Map();

  const record = (name) => touched.push(name);
  const query = (name, result) => ({
    select: () => ({
      lean: async () => {
        record(name);
        return result();
      },
    }),
    lean: async () => {
      record(name);
      return result();
    },
  });

  const models = {
    User: {
      findById: (id) => query("User.findById", () => null),
      deleteOne: async () => (record("User.deleteOne"), { deletedCount: 1 }),
    },
    Reputation: {
      findOne: () => query("Reputation.findOne", () => null),
      findOneAndUpdate: async ({ userId }, update) => {
        record("Reputation.findOneAndUpdate");
        const next = (reps.get(userId) ?? 0) + (update.$inc?.rep ?? 0);
        reps.set(userId, next);
        return { userId, rep: next };
      },
      deleteOne: async () => (record("Reputation.deleteOne"), { deletedCount: 1 }),
    },
    RepBan: {
      exists: async ({ userId }) => (record("RepBan.exists"), repBans.has(userId)),
    },
    RepGrant: {
      create: async (doc) => (record("RepGrant.create"), doc),
      deleteMany: async (filter) => {
        record("RepGrant.deleteMany");
        const ids = (filter.$or || []).map((clause) => clause.giverId || clause.receiverId);
        assert(
          ids.length === 2 && ids.every((id) => id === "leaver"),
          "RepGrant delete must cover grants given and received"
        );
        return { deletedCount: 4 };
      },
    },
    PollVote: {
      countDocuments: async () => (record("PollVote.countDocuments"), 0),
      deleteMany: async () => (record("PollVote.deleteMany"), { deletedCount: 3 }),
    },
    Poll: {
      countDocuments: async () => (record("Poll.countDocuments"), 0),
      updateMany: async () => (record("Poll.updateMany"), { modifiedCount: 1 }),
    },
    XpFlushGrant: {
      deleteMany: async () => (record("XpFlushGrant.deleteMany"), { deletedCount: 2 }),
    },
    UserPrivacy: {
      find: () =>
        query("UserPrivacy.find", () =>
          [...privacyDocs.values()].filter((d) => d.contentOptOut)
        ),
      findOne: ({ userId }) =>
        query("UserPrivacy.findOne", () => privacyDocs.get(userId) || null),
      updateOne: async ({ userId }, update, options) => {
        record("UserPrivacy.updateOne");
        assert(options?.upsert === true, "UserPrivacy writes must upsert");
        const doc = privacyDocs.get(userId) || { userId, contentOptOut: false };
        Object.assign(doc, update.$set);
        privacyDocs.set(userId, doc);
        return { acknowledged: true };
      },
    },
  };

  for (const name of PROTECTED_MODELS) {
    if (models[name]) continue;
    models[name] = new Proxy(
      {},
      {
        get: (_, prop) => {
          record(`${name}.${String(prop)}`);
          return async () => null;
        },
      }
    );
  }

  return { touched, privacyDocs, repBans, reps, models };
}

function createMockRedis() {
  const calls = [];
  const drainingKeys = ["xp:draining:guild1:f1", "xp:draining-boosters:guild1:f1"];
  return {
    calls,
    lockAvailable: true,
    async set(...args) {
      calls.push({ op: "set", args });
      return this.lockAvailable ? "OK" : null;
    },
    async del(...keys) {
      calls.push({ op: "del", args: keys });
      return keys.length;
    },
    async hget() {
      return null;
    },
    scanStream({ match }) {
      const stream = new EventEmitter();
      const prefix = match.replace("*", "");
      setImmediate(() => {
        stream.emit("data", drainingKeys.filter((k) => k.startsWith(prefix)));
        stream.emit("end");
      });
      return stream;
    },
    pipeline() {
      const ops = [];
      return {
        hdel(key, field) {
          ops.push({ op: "hdel", args: [key, field] });
        },
        async exec() {
          calls.push(...ops);
          return ops.map(() => [null, 1]);
        },
      };
    },
  };
}

const RELOADED = [
  "../utils/contentOptOut",
  "../utils/repAwards",
  "../utils/deleteUserData",
  "../utils/xpFlush",
  "../systems/rankSystem",
  "../systems/reputation.js",
  "../systems/sticky.js",
  "../commands/utility/privacy.js",
];

function loadWithMocks(tracker, redis) {
  const dbPath = require.resolve("@ralevel/db");
  const redisPath = require.resolve("../redis");

  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: { ...realDb, ...tracker.models },
  };
  require.cache[redisPath] = {
    id: redisPath,
    filename: redisPath,
    loaded: true,
    exports: redis,
  };
  for (const rel of RELOADED) delete require.cache[require.resolve(rel)];

  return {
    optOut: require("../utils/contentOptOut"),
    deletion: require("../utils/deleteUserData"),
    reputationSystem: require("../systems/reputation.js"),
    stickySystem: require("../systems/sticky.js"),
    privacyCommand: require("../commands/utility/privacy.js"),
  };
}

function createMockMember(id, roleIds = []) {
  const held = new Set(roleIds);
  const removed = [];
  return {
    id,
    partial: false,
    removed,
    roles: {
      cache: { has: (roleId) => held.has(roleId) },
      remove: async (ids) => {
        for (const roleId of [].concat(ids)) {
          removed.push(roleId);
          held.delete(roleId);
        }
      },
      add: async () => {},
    },
    toString: () => `<@${id}>`,
  };
}

function createMockGuild(...members) {
  const byId = new Map(members.map((m) => [m.id, m]));
  return {
    members: {
      me: {
        permissions: {
          has: (flag) => flag === PermissionsBitField.Flags.ManageRoles,
        },
      },
      fetch: async (id) => byId.get(id) || null,
    },
  };
}

// Records whether anything read message.content.
function createMessage({ id, authorId, content, reference = null, target }) {
  const reads = { content: 0, fetchReference: 0 };
  let sends = 0;
  const message = {
    id,
    author: { id: authorId },
    reference,
    guild: createMockGuild(target || createMockMember("nobody")),
    member: createMockMember(authorId),
    mentions: { members: new Map() },
    channel: {
      id: "sticky-channel",
      send: async () => {
        sends += 1;
        return { id: `sent-${sends}` };
      },
      messages: { delete: async () => {} },
    },
    fetchReference: async () => {
      reads.fetchReference += 1;
      return { author: { id: target?.id }, member: target };
    },
  };
  Object.defineProperty(message, "content", {
    get() {
      reads.content += 1;
      return content;
    },
  });
  return { message, reads, sends: () => sends };
}

async function testLoadAndToggleOptOut() {
  const tracker = createTracker();
  tracker.privacyDocs.set("opted", { userId: "opted", contentOptOut: true });
  tracker.privacyDocs.set("in", { userId: "in", contentOptOut: false });
  const { optOut } = loadWithMocks(tracker, createMockRedis());

  const count = await optOut.loadContentOptOuts();
  assert(count === 1, `expected 1 loaded opt-out, got ${count}`);
  assert(optOut.isContentOptedOut("opted"), "opted user should be in the set");
  assert(!optOut.isContentOptedOut("in"), "non-opted user should not be in the set");

  const queriesBefore = tracker.touched.length;
  for (let i = 0; i < 100; i += 1) optOut.isContentOptedOut("opted");
  assert(
    tracker.touched.length === queriesBefore,
    "isContentOptedOut must not query MongoDB"
  );

  await optOut.setContentOptOut("in", true);
  assert(optOut.isContentOptedOut("in"), "set on should update the in-memory set");
  assert(tracker.privacyDocs.get("in").contentOptOut === true, "set on should persist");
  await optOut.setContentOptOut("in", false);
  assert(!optOut.isContentOptedOut("in"), "set off should update the in-memory set");
}

async function testOptOutSkipsRepDetection() {
  const tracker = createTracker();
  const { optOut, reputationSystem } = loadWithMocks(tracker, createMockRedis());
  await optOut.setContentOptOut("opted-author", true);
  const handle = reputationSystem({});
  const target = createMockMember("helper");

  const { message, reads, sends } = createMessage({
    id: "msg-opted",
    authorId: "opted-author",
    content: "thanks",
    reference: { messageId: "prev" },
    target,
  });
  await handle(message);

  assert(reads.content === 0, "opted-out author's content must not be read");
  assert(reads.fetchReference === 0, "opted-out author's reply must not be fetched");
  assert(sends() === 0, "no rep message for opted-out author");
  assert(!tracker.reps.has("helper"), "no rep should be awarded");
}

async function testNonOptedAuthorStillAwards() {
  const tracker = createTracker();
  const { optOut, reputationSystem } = loadWithMocks(tracker, createMockRedis());
  // Opted-out members can still receive rep from others.
  await optOut.setContentOptOut("helper", true);
  const handle = reputationSystem({});
  const target = createMockMember("helper");

  const { message, sends } = createMessage({
    id: "msg-normal",
    authorId: "normal-author",
    content: "thanks",
    reference: { messageId: "prev" },
    target,
  });
  await handle(message);

  assert(sends() === 1, `expected 1 rep message, got ${sends()}`);
  assert(tracker.reps.get("helper") === 1, "opted-out target should still receive rep");
}

async function testStickyCountsOptedOutAsOneLine() {
  const tracker = createTracker();
  const { optOut, stickySystem } = loadWithMocks(tracker, createMockRedis());
  await optOut.setContentOptOut("opted-author", true);

  const client = { once: () => {} };
  const handle = stickySystem(client);
  client.stickies.set("sticky-channel", {
    channelId: "sticky-channel",
    content: "Read the rules",
    lineThreshold: 3,
    lastMessageId: null,
    enabled: true,
  });

  const fiveLines = "a\nb\nc\nd\ne";
  let totalSends = 0;
  for (let i = 1; i <= 2; i += 1) {
    const { message, reads, sends } = createMessage({
      id: `opted-${i}`,
      authorId: "opted-author",
      content: fiveLines,
    });
    await handle(message);
    assert(reads.content === 0, "opted-out sticky message content must not be read");
    totalSends += sends();
  }
  assert(totalSends === 0, "two opted-out messages (2 lines) should not hit threshold 3");

  const third = createMessage({ id: "opted-3", authorId: "opted-author", content: fiveLines });
  await handle(third.message);
  assert(third.sends() === 1, "third opted-out message should repost the sticky");

  const normal = createMessage({ id: "normal-1", authorId: "normal-author", content: fiveLines });
  await handle(normal.message);
  assert(normal.reads.content > 0, "non-opted message content is counted normally");
  assert(normal.sends() === 1, "a 5-line normal message should hit threshold 3");
}

async function testDeleteTouchesOnlyEngagementData() {
  const tracker = createTracker();
  tracker.privacyDocs.set("leaver", { userId: "leaver", contentOptOut: true });
  const redis = createMockRedis();
  const { deletion } = loadWithMocks(tracker, redis);
  const member = createMockMember("leaver", ["role-rank1", "role-rank2", "role-beginner"]);

  const result = await deletion.deleteUserData({
    guild: createMockGuild(member),
    guildId: "guild1",
    userId: "leaver",
  });

  assert(result.busy === false, "should not report busy when lock is free");
  assert(result.deleted.repGrants === 4, "should report deleted rep grants");

  const expected = [
    "User.deleteOne",
    "Reputation.deleteOne",
    "RepGrant.deleteMany",
    "PollVote.deleteMany",
    "Poll.updateMany",
    "XpFlushGrant.deleteMany",
    "UserPrivacy.updateOne",
  ];
  const touched = [...new Set(tracker.touched)].sort();
  assert(
    JSON.stringify(touched) === JSON.stringify([...expected].sort()),
    `unexpected collections touched: ${touched.join(", ")}`
  );
  for (const name of PROTECTED_MODELS) {
    assert(
      !tracker.touched.some((t) => t.startsWith(`${name}.`)),
      `${name} must not be touched by delete-my-data`
    );
  }

  const privacy = tracker.privacyDocs.get("leaver");
  assert(privacy.contentOptOut === true, "opt-out preference must be kept");
  assert(privacy.dataDeletedAt instanceof Date, "deletion time must be stored for the cooldown");

  const hdels = redis.calls.filter((c) => c.op === "hdel").map((c) => c.args.join(" "));
  for (const key of [
    "xp:pending:guild1",
    "xp:boosters:guild1",
    "xp:draining:guild1:f1",
    "xp:draining-boosters:guild1:f1",
  ]) {
    assert(hdels.includes(`${key} leaver`), `expected HDEL ${key} leaver`);
  }

  const lockSet = redis.calls.find((c) => c.op === "set");
  assert(lockSet?.args[0] === "xp:flush:lock:guild1", "should take the XP flush lock");
  assert(lockSet.args.includes("NX"), "flush lock must use NX");
  assert(
    redis.calls.some((c) => c.op === "del" && c.args.includes("xp:flush:lock:guild1")),
    "should release the XP flush lock"
  );

  for (const roleId of ["role-rank1", "role-rank2", "role-beginner"]) {
    assert(member.removed.includes(roleId), `${roleId} should be removed`);
  }
}

async function testDeleteWaitsForRunningFlush() {
  const tracker = createTracker();
  const redis = createMockRedis();
  redis.lockAvailable = false;
  const { deletion } = loadWithMocks(tracker, redis);

  const result = await deletion.deleteUserData({
    guild: null,
    guildId: "guild1",
    userId: "leaver",
  });

  assert(result.busy === true, "should report busy while a flush holds the lock");
  assert(tracker.touched.length === 0, "nothing should be deleted while busy");
}

async function testDeletionCooldown() {
  const tracker = createTracker();
  const { deletion } = loadWithMocks(tracker, createMockRedis());
  const now = Date.now();

  tracker.privacyDocs.set("recent", {
    userId: "recent",
    dataDeletedAt: new Date(now - 60 * 60 * 1000),
  });
  tracker.privacyDocs.set("old", {
    userId: "old",
    dataDeletedAt: new Date(now - 25 * 60 * 60 * 1000),
  });

  assert(
    (await deletion.getDeletionCooldownRemaining("recent", now)) > 0,
    "deletion 1h ago should still be on cooldown"
  );
  assert(
    (await deletion.getDeletionCooldownRemaining("old", now)) === 0,
    "deletion 25h ago should be off cooldown"
  );
  assert(
    (await deletion.getDeletionCooldownRemaining("never", now)) === 0,
    "never-deleted user should have no cooldown"
  );
}

function testCommandRegistration() {
  const tracker = createTracker();
  const { privacyCommand } = loadWithMocks(tracker, createMockRedis());
  const payload = privacyCommand.data.toJSON();

  assert(payload.name === "privacy", "command should be named privacy");
  const subs = payload.options.map((o) => o.name).sort();
  assert(
    JSON.stringify(subs) === JSON.stringify(["delete-my-data", "message-content", "status"]),
    `unexpected subcommands: ${subs.join(", ")}`
  );
  assert(!payload.default_member_permissions, "privacy must be visible to everyone");
  assert(
    Array.isArray(realDb.DEFAULT_COMMAND_PERMISSIONS.privacy) &&
      realDb.DEFAULT_COMMAND_PERMISSIONS.privacy.length === 0,
    "privacy should have no role gate"
  );
  assert(realDb.DEFAULT_COMMAND_EPHEMERAL.privacy === true, "privacy replies should be ephemeral");
}

async function testMessageContentOffOptsOut() {
  const tracker = createTracker();
  const { optOut, privacyCommand } = loadWithMocks(tracker, createMockRedis());

  const run = (setting) =>
    privacyCommand.execute({
      user: { id: "member" },
      options: {
        getSubcommand: () => "message-content",
        getString: () => setting,
      },
      reply: async () => {},
    });

  await run("off");
  assert(optOut.isContentOptedOut("member"), "message-content off should opt the member out");
  await run("on");
  assert(!optOut.isContentOptedOut("member"), "message-content on should opt the member back in");
}

async function main() {
  setupTestGuildConfig();
  await testLoadAndToggleOptOut();
  await testOptOutSkipsRepDetection();
  await testNonOptedAuthorStillAwards();
  await testStickyCountsOptedOutAsOneLine();
  await testDeleteTouchesOnlyEngagementData();
  await testDeleteWaitsForRunningFlush();
  await testDeletionCooldown();
  testCommandRegistration();
  await testMessageContentOffOptsOut();

  console.log("verify-privacy: all checks passed");
  // sticky.js registers SIGINT/SIGTERM flush handlers.
  process.exit(0);
}

main().catch((err) => {
  console.error("verify-privacy failed:", err.message);
  process.exit(1);
});
