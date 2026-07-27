require("../loadEnv");
const { flushPendingXp } = require("./xpFlush");

/**
 * One-shot manual flush of pending Redis XP into Mongo via the idempotent grant ledger.
 * Usage: node utils/flushRedisToMongo.js
 */
async function flush() {
  try {
    const result = await flushPendingXp(null, { acquireLock: true });
    console.log("Flush result:", result);
    process.exit(0);
  } catch (err) {
    console.error("❌ Error:", err);
    process.exit(1);
  }
}

flush();
