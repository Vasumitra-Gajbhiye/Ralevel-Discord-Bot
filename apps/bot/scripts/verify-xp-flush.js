require("../loadEnv");
const {
  buildGrantDocs,
  getPendingKey,
  getBoosterKey,
  getDrainingKey,
  getDrainingBoostersKey,
  getFlushLockKey,
  generateFlushId,
  FLUSH_LOCK_TTL_SEC,
} = require("../utils/xpFlush");
const {
  PENDING_KEY_TTL_SEC,
} = require("../utils/xpKeys");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function testKeyHelpers() {
  const guildId = "guild-1";
  const flushId = "123-abc";

  assert(
    getPendingKey(guildId) === "xp:pending:guild-1",
    "pending key shape"
  );
  assert(
    getBoosterKey(guildId) === "xp:boosters:guild-1",
    "booster key shape"
  );
  assert(
    getDrainingKey(guildId, flushId) === "xp:draining:guild-1:123-abc",
    "draining key shape"
  );
  assert(
    getDrainingBoostersKey(guildId, flushId) ===
      "xp:draining-boosters:guild-1:123-abc",
    "draining boosters key shape"
  );
  assert(
    getFlushLockKey(guildId) === "xp:flush:lock:guild-1",
    "flush lock key shape"
  );
  assert(FLUSH_LOCK_TTL_SEC === 120, "lock TTL should be 120s");
  assert(PENDING_KEY_TTL_SEC === 60 * 60 * 24 * 7, "pending TTL should be 7d");
}

function testGenerateFlushId() {
  const a = generateFlushId();
  const b = generateFlushId();
  assert(typeof a === "string" && a.includes("-"), "flushId format");
  assert(a !== b, "flushIds should be unique");
}

function testBuildGrantDocs() {
  const { docs, grantMeta } = buildGrantDocs({
    guildId: "g1",
    flushId: "f1",
    counts: { u1: "10", u2: "5", u3: "0", banned: "3" },
    boosters: { u1: "true", u2: "false" },
    bannedUserIds: new Set(["banned"]),
    dateIst: "2026-07-27",
    boosterMultiplier: 2,
  });

  assert(docs.length === 2, "should skip zero-count and banned users");
  const u1 = docs.find((d) => d.userId === "u1");
  const u2 = docs.find((d) => d.userId === "u2");
  assert(u1.xp === 20, "booster XP should be count * multiplier");
  assert(u1.messages === 10, "messages should match count");
  assert(u1.applied === false, "new grants start unapplied");
  assert(u2.xp === 5, "non-booster XP should equal count");
  assert(grantMeta.length === 2, "grantMeta should align with docs");
}

async function testFlushLockUsesSetNx() {
  const redisModule = require("../redis");
  const calls = [];
  const saved = {
    set: redisModule.set,
    rename: redisModule.rename,
    del: redisModule.del,
    hgetall: redisModule.hgetall,
  };

  redisModule.set = async (...args) => {
    calls.push({ op: "set", args });
    return null; // lock not acquired
  };

  process.env.GUILD_ID = "guild-lock-test";

  try {
    const { flushPendingXp } = require("../utils/xpFlush");
    const result = await flushPendingXp(null, { acquireLock: true });
    assert(result?.locked === true, "should report locked when SET NX fails");
    assert(calls.length === 1, "should attempt lock once");
    assert(calls[0].args[0] === "xp:flush:lock:guild-lock-test", "lock key");
    assert(calls[0].args.includes("NX"), "lock must use NX");
  } finally {
    Object.assign(redisModule, saved);
  }
}

async function main() {
  testKeyHelpers();
  testGenerateFlushId();
  testBuildGrantDocs();
  await testFlushLockUsesSetNx();

  await require("../redis").quit();
  console.log("✅ xp flush verification passed");
}

main().catch((err) => {
  console.error("❌ xp flush verification failed:", err);
  process.exit(1);
});
