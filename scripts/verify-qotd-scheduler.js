const fs = require("fs");
const path = require("path");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function testQotdSourceOrder() {
  const qotdPath = path.join(__dirname, "../systems/qotd.js");
  const source = fs.readFileSync(qotdPath, "utf8");

  const hourCheckIndex = source.indexOf("hour < REMINDER_HOUR_IST");
  const findRotationIndex = source.indexOf("await findActiveRotation");

  assert(hourCheckIndex !== -1, "qotd.js must check REMINDER_HOUR_IST before MongoDB");
  assert(findRotationIndex !== -1, "qotd.js must await findActiveRotation()");
  assert(
    hourCheckIndex < findRotationIndex,
    "qotd.js must check IST hour before findActiveRotation",
  );
}

function testDailyFinalizeNoDuplicateISTHelper() {
  const source = fs.readFileSync(
    path.join(__dirname, "../systems/dailyFinalizeSystem.js"),
    "utf8",
  );

  assert(
    !source.includes("function getISTDateInfo"),
    "dailyFinalizeSystem.js must import getISTDateInfo instead of defining it",
  );
  assert(
    source.includes('require("../utils/qotdHelpers")'),
    "dailyFinalizeSystem.js must import from qotdHelpers",
  );
}

function testGetISTDateInfoShape() {
  const { getISTDateInfo } = require("../utils/qotdHelpers");
  const info = getISTDateInfo();

  assert(typeof info.dateStr === "string", "getISTDateInfo must return dateStr");
  assert(typeof info.hour === "number", "getISTDateInfo must return hour");
  assert(typeof info.minute === "number", "getISTDateInfo must return minute");
}

function loadQotdHelpersWithMock(findOneImpl) {
  const modelPath = require.resolve("../models/qotdRotation.js");
  const helpersPath = require.resolve("../utils/qotdHelpers.js");

  let findOneCalls = 0;
  const mockFindOne = async (...args) => {
    findOneCalls += 1;
    return findOneImpl(...args);
  };

  require.cache[modelPath] = {
    id: modelPath,
    filename: modelPath,
    loaded: true,
    exports: { findOne: mockFindOne },
  };
  delete require.cache[helpersPath];

  const helpers = require("../utils/qotdHelpers");
  return { helpers, getFindOneCalls: () => findOneCalls };
}

async function testRotationCacheTTL() {
  const mockDoc = { guildId: "test", modOrder: [], currentIndex: 0 };
  const { helpers, getFindOneCalls } = loadQotdHelpersWithMock(async () => mockDoc);

  helpers.invalidateRotationCache();

  const first = await helpers.findActiveRotation();
  assert(first === mockDoc, "first call should return mock doc");
  assert(getFindOneCalls() === 1, "first call should hit MongoDB");

  const second = await helpers.findActiveRotation();
  assert(second === mockDoc, "cached call should return same doc");
  assert(getFindOneCalls() === 1, "cached call should not hit MongoDB again");

  const third = await helpers.findActiveRotation({ bypassCache: true });
  assert(third === mockDoc, "bypassCache should still return mock doc");
  assert(getFindOneCalls() === 2, "bypassCache should force MongoDB read");
}

async function testUpdateRotationCache() {
  const mockDoc = { guildId: "test", lastReminderDate: "2026-06-21" };
  const { helpers, getFindOneCalls } = loadQotdHelpersWithMock(async () => ({
    guildId: "other",
  }));

  helpers.invalidateRotationCache();
  helpers.updateRotationCache(mockDoc);

  const cached = await helpers.findActiveRotation();
  assert(cached === mockDoc, "updateRotationCache should serve doc without MongoDB");
  assert(getFindOneCalls() === 0, "updateRotationCache should avoid MongoDB read");
}

async function main() {
  testQotdSourceOrder();
  testDailyFinalizeNoDuplicateISTHelper();
  testGetISTDateInfoShape();
  await testRotationCacheTTL();
  await testUpdateRotationCache();
  console.log("✅ QOTD scheduler verification passed");
}

main().catch((err) => {
  console.error("❌ QOTD scheduler verification failed:", err);
  process.exit(1);
});
