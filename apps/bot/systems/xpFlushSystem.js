const {
  flushPendingXp,
  resumeOrphanDrains,
} = require("../utils/xpFlush");

const FLUSH_INTERVAL_MS = 90_000;

module.exports = function xpFlushSystem(client) {
  async function checkAndRun() {
    try {
      await flushPendingXp(client);
    } catch (err) {
      console.error("[xpFlush] flush error:", err);
    }
  }

  async function startup() {
    try {
      await resumeOrphanDrains(client);
    } catch (err) {
      console.error("[xpFlush] orphan resume error:", err);
    }
    await checkAndRun();
  }

  setInterval(checkAndRun, FLUSH_INTERVAL_MS);
  setTimeout(startup, 10_000);
};

module.exports.FLUSH_INTERVAL_MS = FLUSH_INTERVAL_MS;
