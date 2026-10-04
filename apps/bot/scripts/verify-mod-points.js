const { ModPoint, ModLog, Warning, DEFAULT_MOD_POINTS } = require("@ralevel/db");
const { setGuildConfig } = require("../utils/guildConfigStore");
const modPoints = require("../utils/modPoints");
const warnCommand = require("../commands/moderation/warn");
const timeoutCommand = require("../commands/moderation/timeout");
const untimeoutCommand = require("../commands/moderation/untimeout");
const delwarnCommand = require("../commands/moderation/delwarn");
const clearwarnsCommand = require("../commands/moderation/clearwarns");
const unbanCommand = require("../commands/moderation/unban");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

// ---------- in-memory ModPoint / Warning / ModLog ----------

let store = [];
let warnings = [];
let nextId = 1;

function matches(doc, filter) {
  return Object.entries(filter).every(([key, cond]) => {
    if (key === "$or") return cond.some((sub) => matches(doc, sub));
    const value = doc[key];
    if (cond === null) return value == null;
    if (cond && typeof cond === "object" && !(cond instanceof Date)) {
      if ("$in" in cond) return cond.$in.includes(value);
      if ("$gt" in cond) return value != null && value > cond.$gt;
      if ("$exists" in cond) return (key in doc) === cond.$exists;
    }
    return String(value) === String(cond);
  });
}

// Supports { $set } and the [{ $set: { f: { $add: ["$field", n] } } }] pipeline form.
function applyUpdate(doc, update) {
  if (!Array.isArray(update)) return Object.assign(doc, update.$set);
  for (const stage of update) {
    for (const [key, expr] of Object.entries(stage.$set)) {
      const [field, amount] = expr.$add;
      doc[key] = new Date(doc[field.slice(1)].getTime() + amount);
    }
  }
}

function query(results) {
  return {
    sort: () => query(results),
    lean: async () => results.map((doc) => ({ ...doc })),
    then: (resolve, reject) => Promise.resolve(results).then(resolve, reject),
  };
}

function newestFirst(docs) {
  // Later inserts win ties, like ascending ObjectIds in Mongo
  return docs
    .map((doc, index) => ({ doc, index }))
    .sort((a, b) => b.doc.createdAt - a.doc.createdAt || b.index - a.index)
    .map(({ doc }) => doc);
}

ModPoint.find = (filter) => query(newestFirst(store.filter((d) => matches(d, filter))));
ModPoint.findOne = (filter) => {
  const [first] = newestFirst(store.filter((d) => matches(d, filter)));
  return { sort: () => ({ lean: async () => (first ? { ...first } : null) }) };
};
ModPoint.create = async (doc) => {
  const created = { _id: `p${nextId++}`, active: true, createdAt: new Date(), ...doc };
  store.push(created);
  return created;
};
ModPoint.updateMany = async (filter, update) => {
  let modifiedCount = 0;
  for (const doc of store) {
    if (matches(doc, filter)) {
      applyUpdate(doc, update);
      modifiedCount++;
    }
  }
  return { modifiedCount };
};

ModLog.create = async (doc) => doc;
Warning.create = async (doc) => {
  const created = { active: true, ...doc, save: async () => {} };
  warnings.push(created);
  return created;
};
Warning.findOne = async (filter) => warnings.find((w) => matches(w, filter)) || null;
Warning.find = async (filter) => warnings.filter((w) => matches(w, filter));
Warning.updateMany = async (filter, update) => {
  let modifiedCount = 0;
  for (const w of warnings) {
    if (matches(w, filter)) {
      applyUpdate(w, update);
      modifiedCount++;
    }
  }
  return { modifiedCount };
};

// ---------- discord mocks ----------

function makeUser(id) {
  const dms = [];
  return {
    id,
    tag: `user-${id}`,
    dms,
    send: async (content) => dms.push(content),
  };
}

function makeInteraction({ user, options = {}, member = null }) {
  const bans = [];
  const replies = [];
  const interaction = {
    bans,
    replies,
    user: { id: "mod1", tag: "mod#0001" },
    member: null,
    client: {
      user: { id: "bot1", tag: "bot#0001" },
      channels: { fetch: async () => null },
      users: { fetch: async () => user },
    },
    guild: {
      name: "r/Alevel",
      members: { fetch: async () => null, unban: async () => {} },
      bans: {
        create: async (id, opts) => bans.push({ id, ...opts }),
        fetch: async () => ({}),
      },
    },
    options: {
      getUser: () => user,
      getMember: () => member,
      getString: (name) => options[name] ?? null,
    },
    deferReply: async () => {},
    reply: async (payload) => replies.push(payload),
    editReply: async (payload) => replies.push(payload),
  };
  return interaction;
}

function configure(points) {
  setGuildConfig({
    moderation: {
      points: {
        ...DEFAULT_MOD_POINTS,
        enabled: true,
        threshold: 5,
        noticeDistance: 2,
        ...points,
      },
    },
  });
}

function reset() {
  store = [];
  warnings = [];
}

// Silence logModAction's "modLog channel is not set" noise.
const originalError = console.error;
const originalLog = console.log;
function quiet() {
  console.error = () => {};
  console.log = () => {};
}
function loud() {
  console.error = originalError;
  console.log = originalLog;
}

// ---------- tests ----------

async function testZones() {
  reset();
  configure();
  const user = "zone";

  let preview = await modPoints.previewInfraction(user, "warn");
  assert(preview.projected === 2 && preview.zone === "none", "0 + 2 = none zone");

  await ModPoint.create({ userId: user, points: 1, source: "warn" });
  preview = await modPoints.previewInfraction(user, "warn");
  assert(preview.projected === 3 && preview.zone === "notice", "3 >= T-X is notice zone");
  assert(preview.remaining === 2, "remaining should be T - projected");

  await ModPoint.create({ userId: user, points: 1, source: "warn" });
  preview = await modPoints.previewInfraction(user, "warn");
  assert(preview.projected === 4 && preview.zone === "notice", "4 is still notice zone");

  await ModPoint.create({ userId: user, points: 1, source: "warn" });
  preview = await modPoints.previewInfraction(user, "warn");
  assert(preview.projected === 5 && preview.zone === "ban", "reaching T is ban zone");
}

async function testExpiryAndVoid() {
  reset();
  configure();
  const past = new Date(Date.now() - DAY_MS);
  const future = new Date(Date.now() + DAY_MS);
  store.push(
    { _id: "old", userId: "e", points: 4, source: "warn", active: true, createdAt: new Date(), expiresAt: past },
    { _id: "new", userId: "e", points: 1, source: "warn", active: true, createdAt: new Date(), expiresAt: future },
    { _id: "never", userId: "e", points: 2, source: "kick", active: true, createdAt: new Date(), expiresAt: null },
    { _id: "legacy", userId: "e", points: 5, source: "kick", active: true, createdAt: new Date() },
    { _id: "void", userId: "e", points: 3, source: "kick", active: false, createdAt: new Date() },
  );
  const { total } = await modPoints.getActivePoints("e");
  assert(total === 8, `expired and voided entries must not count (got ${total})`);
  assert(modPoints.isExpired(store[0]) && !modPoints.isExpired(store[1]), "isExpired");
  assert(!modPoints.isExpired(store[2]), "null expiresAt never expires");
}

async function testExpiryPerSource() {
  reset();
  configure({ threshold: 100, noticeDistance: 0 });
  const user = makeUser("x");
  const member = {
    id: "x",
    user,
    send: user.send,
    timeout: async () => {},
    isCommunicationDisabled: () => true,
  };
  quiet();
  await warnCommand.execute(makeInteraction({ user, options: { reason: "w" } }));
  await timeoutCommand.execute(
    makeInteraction({ user, member, options: { duration: "1h", reason: "t" } }),
  );
  loud();

  const warnEntry = store.find((d) => d.source === "warn");
  const timeoutEntry = store.find((d) => d.source === "timeout");
  const days = (date) => Math.round((date.getTime() - Date.now()) / DAY_MS);
  assert(days(warnEntry.expiresAt) === 30, "warn points expire in 30 days by default");
  assert(timeoutEntry.expiresAt === null, "timeout points never expire by default");
  assert(
    warnings[0].expiresAt.getTime() === warnEntry.expiresAt.getTime(),
    "warning and its points share the same expiry",
  );
  assert(user.dms[0].includes("This warning expires"), "warn DM mentions expiry");

  // Changing the setting only affects new entries
  configure({ threshold: 100, noticeDistance: 0, expiryDays: { ...DEFAULT_MOD_POINTS.expiryDays, warn: 60 } });
  quiet();
  await warnCommand.execute(makeInteraction({ user, options: { reason: "w2" } }));
  loud();
  const warnEntries = store.filter((d) => d.source === "warn");
  assert(days(warnEntries[0].expiresAt) === 30, "existing entry keeps its 30-day expiry");
  assert(days(warnEntries[1].expiresAt) === 60, "new entry uses the new 60-day expiry");

  // Legacy numeric setting applies to every source
  configure({ expiryDays: 7 });
  assert(modPoints.getPointsConfig().expiryDays.kick === 7, "legacy number applies to all sources");
}

async function testBackfill() {
  reset();
  configure();
  const old = new Date(Date.now() - 40 * DAY_MS);
  const recent = new Date(Date.now() - 5 * DAY_MS);
  warnings.push(
    { actionId: "w-old", userId: "b", active: true, timestamp: old },
    { actionId: "w-recent", userId: "b", active: true, timestamp: recent },
  );
  store.push(
    { _id: "p-old", userId: "b", points: 2, source: "warn", sourceActionId: "w-old", active: true, createdAt: old },
    { _id: "p-recent", userId: "b", points: 2, source: "warn", sourceActionId: "w-recent", active: true, createdAt: recent },
    { _id: "p-kick", userId: "b", points: 4, source: "kick", active: true, createdAt: old },
  );

  const updated = await modPoints.backfillExpiry();
  assert(updated === 5, `backfill updates every document missing expiresAt (got ${updated})`);
  assert(modPoints.isExpired(warnings[0]), "warning older than 30 days is expired");
  assert(!modPoints.isExpired(warnings[1]), "recent warning is not expired");
  assert(store[2].expiresAt === null, "kick points never expire");

  const { total } = await modPoints.getActivePoints("b");
  assert(total === 6, `old warn points drop off after backfill (got ${total})`);

  assert((await modPoints.backfillExpiry()) === 0, "backfill is idempotent");
}

async function testDisabled() {
  reset();
  configure({ enabled: false });
  const user = makeUser("off");
  const interaction = makeInteraction({ user, options: { reason: "spam" } });
  quiet();
  await warnCommand.execute(interaction);
  loud();
  assert(store.length === 0, "disabled system must not record points");
  assert(
    /^⚠️ You have been warned in \*\*r\/Alevel\*\*\.\nReason: \*\*spam\*\*\nThis warning expires <t:\d+:D>\.$/.test(user.dms[0]),
    "disabled system must leave the warn DM without points text",
  );
  assert(warnings[0].expiresAt instanceof Date, "warnings expire even when points are disabled");
  const fields = interaction.replies[0].embeds[0].toJSON().fields;
  assert(!fields.some((f) => f.name === "Points"), "no points field when disabled");
}

async function testWarnFlowToAutoBan() {
  reset();
  configure();
  const user = makeUser("w");

  quiet();
  let interaction = makeInteraction({ user, options: { reason: "r1" } });
  await warnCommand.execute(interaction);
  assert(user.dms[0].includes("Moderation points: **2/5**"), "first warn DM shows 2/5");
  assert(!user.dms[0].includes("automatically banned"), "first warn has no ban notice");

  interaction = makeInteraction({ user, options: { reason: "r2" } });
  await warnCommand.execute(interaction);
  assert(user.dms[1].includes("**4/5**"), "second warn DM shows 4/5");
  assert(user.dms[1].includes("automatically banned"), "second warn includes ban notice");

  interaction = makeInteraction({ user, options: { reason: "r3" } });
  await warnCommand.execute(interaction);
  loud();

  assert(interaction.bans.length === 1, "third warn should auto-ban");
  assert(interaction.bans[0].id === "w", "auto-ban targets the user");
  assert(interaction.bans[0].deleteMessageSeconds === 86400, "uses configured delete window");
  assert(
    interaction.bans[0].reason.includes("6/5"),
    "ban reason is rendered from the reason template",
  );
  assert(user.dms.length === 3 && user.dms[2].includes("banned"), "third DM is the ban DM");
  assert(!user.dms[2].includes("warned"), "auto-ban replaces the warn DM");
  const fields = interaction.replies[0].embeds[0].toJSON().fields;
  assert(
    fields.find((f) => f.name === "Points").value.includes("auto-banned"),
    "reply embed reports the auto-ban",
  );
}

async function testDeleteAndClearWarnings() {
  reset();
  configure({ threshold: 100, noticeDistance: 0 });
  const user = makeUser("d");
  quiet();
  for (const reason of ["a", "b", "c"]) {
    await warnCommand.execute(makeInteraction({ user, options: { reason } }));
  }
  const target = warnings[0];
  await delwarnCommand.execute(
    makeInteraction({ user, options: { actionid: target.actionId, reason: "mistake" } }),
  );
  let { total } = await modPoints.getActivePoints("d");
  assert(total === 4, `delete-warning removes that warning's points (got ${total})`);

  await clearwarnsCommand.execute(makeInteraction({ user, options: { reason: "fresh" } }));
  loud();
  ({ total } = await modPoints.getActivePoints("d"));
  assert(total === 0, `clear-warnings removes all warn points (got ${total})`);
}

async function testTimeoutAndUntimeout() {
  reset();
  configure({ threshold: 100, noticeDistance: 0 });
  const user = makeUser("t");
  const member = {
    id: "t",
    user,
    send: user.send,
    timeout: async () => {},
    isCommunicationDisabled: () => true,
  };
  quiet();
  await timeoutCommand.execute(
    makeInteraction({ user, member, options: { duration: "1h", reason: "x" } }),
  );
  await timeoutCommand.execute(
    makeInteraction({ user, member, options: { duration: "1h", reason: "y" } }),
  );
  assert(user.dms[0].includes("timed out") && user.dms[0].includes("3/100"), "timeout DM shows points");

  await untimeoutCommand.execute(makeInteraction({ user, member, options: { reason: "early" } }));
  loud();
  const { total, entries } = await modPoints.getActivePoints("t");
  assert(total === 3 && entries.length === 1, "untimeout voids only the latest timeout");
  assert(entries[0].reason === "x", "the older timeout's points remain");

  // A failed timeout must not award points
  reset();
  const failing = { ...member, timeout: async () => { throw new Error("no perms"); } };
  quiet();
  await timeoutCommand.execute(
    makeInteraction({ user, member: failing, options: { duration: "1h", reason: "z" } }),
  );
  loud();
  assert(store.length === 0, "failed timeout records no points");
}

async function testUnbanResets() {
  reset();
  configure();
  await ModPoint.create({ userId: "u", points: 3, source: "warn" });
  await ModPoint.create({ userId: "u", points: 3, source: "kick" });
  await ModPoint.create({ userId: "other", points: 3, source: "kick" });
  quiet();
  await unbanCommand.execute(
    makeInteraction({ user: makeUser("u"), options: { userid: "u", reason: "appeal" } }),
  );
  loud();
  assert((await modPoints.getActivePoints("u")).total === 0, "unban resets points to 0");
  assert((await modPoints.getActivePoints("other")).total === 3, "unban leaves other users alone");
}

async function main() {
  await testZones();
  await testExpiryAndVoid();
  await testExpiryPerSource();
  await testBackfill();
  await testDisabled();
  await testWarnFlowToAutoBan();
  await testDeleteAndClearWarnings();
  await testTimeoutAndUntimeout();
  await testUnbanResets();
  console.log("verify-mod-points: all checks passed");
}

main().catch((err) => {
  loud();
  console.error(err);
  process.exit(1);
});
