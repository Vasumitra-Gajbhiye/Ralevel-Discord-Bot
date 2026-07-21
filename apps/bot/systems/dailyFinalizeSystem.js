const finalize = require("../utils/dailyFinalize");
const { getISTDateInfo } = require("../utils/qotdHelpers");
const { getGuildConfig } = require("../utils/guildConfigStore");
const {
  getFinalizeDate,
  getFinalizeLockKey,
} = finalize;

// ===== CONFIG =====
const CHECK_INTERVAL_MS = 5 * 60 * 1000; // every 5 min
const FINALIZE_MINUTE_IST = 0;
// ==================

module.exports = function dailyFinalizeSystem(client) {
  async function checkAndRun() {
    try {
      const { hour, minute } = getISTDateInfo();
      const finalizeHourIst =
        getGuildConfig().schedules?.finalizeHourIst ?? 6;

      if (
        hour < finalizeHourIst ||
        (hour === finalizeHourIst && minute < FINALIZE_MINUTE_IST)
      ) {
        return;
      }

      const redis = require("../redis");
      const guildId = process.env.GUILD_ID;

      const finalizeDate = getFinalizeDate();
      const lockKey = getFinalizeLockKey(guildId, finalizeDate);

      const alreadyProcessed = await redis.get(lockKey);
      if (alreadyProcessed) return;

      console.log(
        `🔥 [FINALIZE] Running for ${finalizeDate} at ${hour}:${minute} IST`
      );

      await finalize(client);
    } catch (err) {
      console.error("Daily finalize system error:", err);
    }
  }

  // run every 5 minutes
  setInterval(checkAndRun, CHECK_INTERVAL_MS);

  // run once after startup (in case bot restarted late)
  setTimeout(checkAndRun, 10_000);
};
