require("../loadEnv");

const {
  connectDB,
  ExamSession,
  ExamPaper,
  ModLog,
  computePaperWindow,
} = require("@ralevel/db");
const {
  Client,
  GatewayIntentBits,
  PermissionFlagsBits,
} = require("discord.js");
const { loadGuildConfig } = require("../utils/loadGuildConfig");
const { unlockChannel } = require("../utils/channelLock");
const {
  computeNextSweepDelay,
  getNextExamEventAt,
  applyLock,
  applyUnlock,
  sweepExamLocks,
  channelStillCovered,
  IDLE_INTERVAL_MS,
  MAX_INTERVAL_MS,
} = require("../systems/examLockSystem");

const TEST_CHANNEL_ID = "1450047433433415733";
const SESSION_NAME_PREFIX = "__verify_exam_lock__";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function everyoneSendDenied(channel) {
  const everyoneId = channel.guild.roles.everyone.id;
  const overwrite = channel.permissionOverwrites.cache.get(everyoneId);
  if (!overwrite) return false;
  return overwrite.deny.has(PermissionFlagsBits.SendMessages);
}

async function findRecentEmbed(channel, titleIncludes) {
  const messages = await channel.messages.fetch({ limit: 15 });
  return messages.find(
    (m) =>
      m.author?.id === channel.client.user?.id &&
      m.embeds?.[0]?.title?.includes(titleIncludes),
  );
}

async function cleanupMongo() {
  const sessions = await ExamSession.find({
    name: { $regex: `^${SESSION_NAME_PREFIX}` },
  }).select("_id");
  const sessionIds = sessions.map((s) => s._id);
  if (sessionIds.length) {
    await ExamPaper.deleteMany({ sessionId: { $in: sessionIds } });
    await ExamSession.deleteMany({ _id: { $in: sessionIds } });
  }
  await ExamPaper.deleteMany({
    label: { $regex: `^${SESSION_NAME_PREFIX}` },
  });
  await ModLog.deleteMany({
    reason: { $regex: SESSION_NAME_PREFIX },
  });
}

async function ensureUnlocked(client) {
  try {
    const channel = await client.channels.fetch(TEST_CHANNEL_ID);
    if (channel?.permissionOverwrites && everyoneSendDenied(channel)) {
      await unlockChannel(channel);
      console.log("  (cleanup) unlocked test channel");
    }
  } catch (err) {
    console.warn("  (cleanup) unlock warning:", err.message);
  }
}

// ─── Unit tests ─────────────────────────────────────────────────────────────

function testComputePaperWindow() {
  const session = {
    amStartUtc: "07:00",
    amEndUtc: "12:00",
    pmStartUtc: "12:30",
    pmEndUtc: "18:00",
  };

  const am = computePaperWindow(session, { date: "2026-06-01", slot: "AM" });
  assert(
    am.lockAt.toISOString() === "2026-06-01T07:00:00.000Z",
    "AM lockAt should be 07:00 UTC",
  );
  assert(
    am.unlockAt.toISOString() === "2026-06-01T12:00:00.000Z",
    "AM unlockAt should be 12:00 UTC",
  );

  const pm = computePaperWindow(session, { date: "2026-06-01", slot: "PM" });
  assert(
    pm.lockAt.toISOString() === "2026-06-01T12:30:00.000Z",
    "PM lockAt should be 12:30 UTC",
  );
  assert(
    pm.unlockAt.toISOString() === "2026-06-01T18:00:00.000Z",
    "PM unlockAt should be 18:00 UTC",
  );

  let threw = false;
  try {
    computePaperWindow(
      { ...session, amEndUtc: "06:00" },
      { date: "2026-06-01", slot: "AM" },
    );
  } catch {
    threw = true;
  }
  assert(threw, "AM end before start should throw");

  console.log("✅ unit: computePaperWindow");
}

function testComputeNextSweepDelay() {
  const now = Date.now();

  assert(
    computeNextSweepDelay(now, new Date(now - 1000)) === 0,
    "overdue should be immediate",
  );
  assert(
    computeNextSweepDelay(now, new Date(now + 30 * 1000)) === 30 * 1000,
    "30s away should schedule in 30s",
  );
  assert(
    computeNextSweepDelay(now, new Date(now + 2 * 60 * 60 * 1000)) ===
      MAX_INTERVAL_MS,
    "far deadline should cap at MAX_INTERVAL_MS",
  );
  assert(
    computeNextSweepDelay(now, null) === IDLE_INTERVAL_MS,
    "null deadline should use IDLE_INTERVAL_MS",
  );

  console.log("✅ unit: computeNextSweepDelay");
}

async function testChannelStillCovered() {
  await cleanupMongo();
  const guildId = process.env.GUILD_ID || "verify-guild";
  const now = new Date();

  const session = await ExamSession.create({
    guildId,
    name: `${SESSION_NAME_PREFIX} overlap unit`,
    amStartUtc: "00:00",
    amEndUtc: "23:59",
    pmStartUtc: "00:00",
    pmEndUtc: "23:59",
    status: "active",
  });

  const other = await ExamPaper.create({
    sessionId: session._id,
    guildId,
    label: `${SESSION_NAME_PREFIX} covering`,
    date: "2099-01-01",
    slot: "AM",
    channelIds: [TEST_CHANNEL_ID],
    lockAt: new Date(now.getTime() - 60_000),
    unlockAt: new Date(now.getTime() + 60 * 60_000),
    status: "locked",
  });

  const self = await ExamPaper.create({
    sessionId: session._id,
    guildId,
    label: `${SESSION_NAME_PREFIX} self`,
    date: "2099-01-01",
    slot: "PM",
    channelIds: [TEST_CHANNEL_ID],
    lockAt: new Date(now.getTime() - 30_000),
    unlockAt: new Date(now.getTime() + 30_000),
    status: "locked",
  });

  assert(
    await channelStillCovered(TEST_CHANNEL_ID, self._id, now),
    "should be covered by overlapping locked paper",
  );

  other.status = "unlocked";
  await other.save();

  assert(
    !(await channelStillCovered(TEST_CHANNEL_ID, self._id, now)),
    "should not be covered after other unlocks",
  );

  await cleanupMongo();
  console.log("✅ unit: channelStillCovered");
}

async function testGetNextExamEventAt() {
  await cleanupMongo();
  const guildId = process.env.GUILD_ID || "verify-guild";
  const futureLock = new Date(Date.now() + 45 * 60_000);

  const session = await ExamSession.create({
    guildId,
    name: `${SESSION_NAME_PREFIX} next event`,
    amStartUtc: "07:00",
    amEndUtc: "12:00",
    pmStartUtc: "12:00",
    pmEndUtc: "18:00",
    status: "active",
  });

  await ExamPaper.create({
    sessionId: session._id,
    guildId,
    label: `${SESSION_NAME_PREFIX} future`,
    date: "2099-06-01",
    slot: "AM",
    channelIds: [TEST_CHANNEL_ID],
    lockAt: futureLock,
    unlockAt: new Date(futureLock.getTime() + 60 * 60_000),
    status: "scheduled",
  });

  const next = await getNextExamEventAt();
  assert(next, "getNextExamEventAt should return a date");
  assert(
    Math.abs(new Date(next).getTime() - futureLock.getTime()) < 1000,
    "getNextExamEventAt should return soonest lockAt",
  );

  await cleanupMongo();
  console.log("✅ unit: getNextExamEventAt");
}

// ─── Live Discord tests ─────────────────────────────────────────────────────

async function createTestSession(guildId) {
  return ExamSession.create({
    guildId,
    name: `${SESSION_NAME_PREFIX} live ${Date.now()}`,
    amStartUtc: "00:00",
    amEndUtc: "23:50",
    pmStartUtc: "00:00",
    pmEndUtc: "23:55",
    status: "active",
  });
}

async function testLiveLockAndUnlock(client, guildId) {
  console.log("→ live: lock + unlock");
  const session = await createTestSession(guildId);
  const now = Date.now();

  let paper = await ExamPaper.create({
    sessionId: session._id,
    guildId,
    label: `${SESSION_NAME_PREFIX} lock-unlock`,
    date: "2099-01-02",
    slot: "AM",
    channelIds: [TEST_CHANNEL_ID],
    lockAt: new Date(now - 60_000),
    unlockAt: new Date(now + 30 * 60_000),
    status: "scheduled",
  });

  await applyLock(client, paper);
  paper = await ExamPaper.findById(paper._id);
  assert(paper.status === "locked", "paper should be locked after applyLock");
  assert(paper.lockedAt, "lockedAt should be set");

  const channel = await client.channels.fetch(TEST_CHANNEL_ID);
  assert(everyoneSendDenied(channel), "@everyone SendMessages should be denied");

  const lockMsg = await findRecentEmbed(channel, "Channel locked for exams");
  assert(lockMsg, "lock notice embed should be posted in channel");

  const lockLog = await ModLog.findOne({
    action: "exam-lock-channel",
    channelId: TEST_CHANNEL_ID,
    reason: { $regex: SESSION_NAME_PREFIX },
  })
    .sort({ timestamp: -1 })
    .lean();
  assert(lockLog, "ModLog exam-lock-channel should exist");

  await applyUnlock(client, paper);
  paper = await ExamPaper.findById(paper._id);
  assert(paper.status === "unlocked", "paper should be unlocked");
  assert(paper.unlockedAt, "unlockedAt should be set");

  const channelAfter = await client.channels.fetch(TEST_CHANNEL_ID);
  assert(
    !everyoneSendDenied(channelAfter),
    "@everyone SendMessages deny should be cleared",
  );

  const unlockMsg = await findRecentEmbed(channelAfter, "Channel unlocked");
  assert(unlockMsg, "unlock notice embed should be posted");

  const unlockLog = await ModLog.findOne({
    action: "exam-unlock-channel",
    channelId: TEST_CHANNEL_ID,
    reason: { $regex: SESSION_NAME_PREFIX },
  })
    .sort({ timestamp: -1 })
    .lean();
  assert(unlockLog, "ModLog exam-unlock-channel should exist");

  console.log("✅ live: lock + unlock");
}

async function testLiveSweepTimedUnlock(client, guildId) {
  console.log("→ live: sweep timed unlock");
  const session = await createTestSession(guildId);
  const now = Date.now();

  let paper = await ExamPaper.create({
    sessionId: session._id,
    guildId,
    label: `${SESSION_NAME_PREFIX} sweep-unlock`,
    date: "2099-01-03",
    slot: "AM",
    channelIds: [TEST_CHANNEL_ID],
    lockAt: new Date(now - 120_000),
    unlockAt: new Date(now - 5_000),
    status: "locked",
    lockedAt: new Date(now - 120_000),
  });

  // Ensure channel is locked first so unlock is observable
  const channel = await client.channels.fetch(TEST_CHANNEL_ID);
  const { lockChannel } = require("../utils/channelLock");
  await lockChannel(channel);

  await sweepExamLocks(client);

  paper = await ExamPaper.findById(paper._id);
  assert(paper.status === "unlocked", "sweeper should unlock past unlockAt paper");

  const channelAfter = await client.channels.fetch(TEST_CHANNEL_ID);
  assert(
    !everyoneSendDenied(channelAfter),
    "channel should be unlocked after sweep",
  );

  console.log("✅ live: sweep timed unlock");
}

async function testLiveForceUnlock(client, guildId) {
  console.log("→ live: force unlock");
  const session = await createTestSession(guildId);
  const now = Date.now();

  let paper = await ExamPaper.create({
    sessionId: session._id,
    guildId,
    label: `${SESSION_NAME_PREFIX} force-unlock`,
    date: "2099-01-04",
    slot: "PM",
    channelIds: [TEST_CHANNEL_ID],
    lockAt: new Date(now - 60_000),
    unlockAt: new Date(now + 60 * 60_000),
    status: "scheduled",
  });

  await applyLock(client, paper);
  paper = await ExamPaper.findById(paper._id);
  paper.forceUnlock = true;
  await paper.save();

  await sweepExamLocks(client);

  paper = await ExamPaper.findById(paper._id);
  assert(paper.status === "unlocked", "force unlock should set unlocked");
  assert(!paper.forceUnlock, "forceUnlock flag should clear");

  const channel = await client.channels.fetch(TEST_CHANNEL_ID);
  assert(!everyoneSendDenied(channel), "channel should be unlocked after force");

  const forceLog = await ModLog.findOne({
    action: "exam-force-unlock-channel",
    channelId: TEST_CHANNEL_ID,
    reason: { $regex: SESSION_NAME_PREFIX },
  })
    .sort({ timestamp: -1 })
    .lean();
  assert(forceLog, "ModLog exam-force-unlock-channel should exist");

  console.log("✅ live: force unlock");
}

async function testLiveOverlap(client, guildId) {
  console.log("→ live: overlap safety");
  const session = await createTestSession(guildId);
  const now = Date.now();

  let paperA = await ExamPaper.create({
    sessionId: session._id,
    guildId,
    label: `${SESSION_NAME_PREFIX} overlap-A`,
    date: "2099-01-05",
    slot: "AM",
    channelIds: [TEST_CHANNEL_ID],
    lockAt: new Date(now - 60_000),
    unlockAt: new Date(now + 60 * 60_000),
    status: "scheduled",
  });

  let paperB = await ExamPaper.create({
    sessionId: session._id,
    guildId,
    label: `${SESSION_NAME_PREFIX} overlap-B`,
    date: "2099-01-05",
    slot: "PM",
    channelIds: [TEST_CHANNEL_ID],
    lockAt: new Date(now - 30_000),
    unlockAt: new Date(now + 90 * 60_000),
    status: "scheduled",
  });

  await applyLock(client, paperA);
  paperA = await ExamPaper.findById(paperA._id);
  await applyLock(client, paperB);
  paperB = await ExamPaper.findById(paperB._id);

  await applyUnlock(client, paperA);
  paperA = await ExamPaper.findById(paperA._id);
  assert(paperA.status === "unlocked", "paper A should be unlocked in DB");

  const mid = await client.channels.fetch(TEST_CHANNEL_ID);
  assert(
    everyoneSendDenied(mid),
    "channel must stay locked while paper B still covers it",
  );

  await applyUnlock(client, paperB);
  paperB = await ExamPaper.findById(paperB._id);
  assert(paperB.status === "unlocked", "paper B should be unlocked");

  const end = await client.channels.fetch(TEST_CHANNEL_ID);
  assert(
    !everyoneSendDenied(end),
    "channel should unlock after last overlapping paper",
  );

  console.log("✅ live: overlap safety");
}

async function testLivePastWindowSkip(client, guildId) {
  console.log("→ live: past window skip");
  const session = await createTestSession(guildId);
  const now = Date.now();

  // Start unlocked so we can assert we did not lock
  await ensureUnlocked(client);

  let paper = await ExamPaper.create({
    sessionId: session._id,
    guildId,
    label: `${SESSION_NAME_PREFIX} past-window`,
    date: "2099-01-06",
    slot: "AM",
    channelIds: [TEST_CHANNEL_ID],
    lockAt: new Date(now - 120_000),
    unlockAt: new Date(now - 60_000),
    status: "scheduled",
  });

  await sweepExamLocks(client);

  paper = await ExamPaper.findById(paper._id);
  assert(
    paper.status === "unlocked",
    "past-window scheduled paper should become unlocked without locking",
  );

  const channel = await client.channels.fetch(TEST_CHANNEL_ID);
  assert(
    !everyoneSendDenied(channel),
    "past-window skip must not leave channel locked",
  );

  console.log("✅ live: past window skip");
}

async function runLiveTests() {
  const token = process.env.TOKEN;
  const guildId = process.env.GUILD_ID;
  assert(token, "TOKEN is required for live Discord verification");
  assert(guildId, "GUILD_ID is required for live Discord verification");

  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
  });

  try {
    await new Promise((resolve, reject) => {
      const onReady = () => resolve();
      client.once("clientReady", onReady);
      client.once("ready", onReady);
      client.once("error", reject);
      client.login(token).catch(reject);
    });

    console.log(`  logged in as ${client.user.tag}`);
    await loadGuildConfig(client);

    const channel = await client.channels.fetch(TEST_CHANNEL_ID);
    assert(channel, `test channel ${TEST_CHANNEL_ID} not found`);
    assert(
      channel.guild?.id === guildId,
      `test channel must belong to GUILD_ID ${guildId}`,
    );
    console.log(`  using #${channel.name} (${TEST_CHANNEL_ID})`);

    await cleanupMongo();
    await ensureUnlocked(client);

    await testLiveLockAndUnlock(client, guildId);
    await testLiveSweepTimedUnlock(client, guildId);
    await testLiveForceUnlock(client, guildId);
    await testLiveOverlap(client, guildId);
    await testLivePastWindowSkip(client, guildId);
  } finally {
    await ensureUnlocked(client);
    await cleanupMongo();
    client.destroy();
  }
}

async function main() {
  console.log("Exam lock verification\n");

  testComputePaperWindow();
  testComputeNextSweepDelay();

  await connectDB();

  try {
    await testChannelStillCovered();
    await testGetNextExamEventAt();
    await runLiveTests();
    console.log("\n✅ exam lock verification passed");
  } finally {
    await cleanupMongo();
  }

  process.exit(0);
}

main().catch(async (err) => {
  console.error("\n❌ exam lock verification failed:", err);
  try {
    await cleanupMongo();
  } catch {
    // ignore
  }
  process.exit(1);
});
