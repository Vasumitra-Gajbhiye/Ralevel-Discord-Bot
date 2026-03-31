// const finalize = require("../utils/dailyFinalize");

// // ===== CONFIG =====
// const CHECK_INTERVAL_MS = 5 * 60 * 1000; // every 5 min
// const FINALIZE_HOUR_IST = 6; // change to 9:25 AM IST
// // ==================

// function getISTDateInfo() {
//   const now = new Date();

//   const istTime = new Date(now.getTime() + (5 * 60 + 30) * 60 * 1000);

//   const year = istTime.getUTCFullYear();
//   const month = String(istTime.getUTCMonth() + 1).padStart(2, "0");
//   const day = String(istTime.getUTCDate()).padStart(2, "0");

//   return {
//     dateStr: `${year}-${month}-${day}`,
//     hour: istTime.getUTCHours(),
//   };
// }

// module.exports = function dailyFinalizeSystem(client) {
//   async function checkAndRun() {
//     try {
//       const { dateStr, hour } = getISTDateInfo();

//       // ⛔ Not time yet
//       if (hour < FINALIZE_HOUR_IST) return;

//       const redis = require("../redis");
//       const guildId = process.env.GUILD_ID;

//       const lockKey = `processed:${guildId}:${dateStr}`;

//       const alreadyProcessed = await redis.get(lockKey);
//       if (alreadyProcessed) return;

//       console.log(`🔥 [FINALIZE] Running for ${dateStr}`);

//       await finalize(client);
//     } catch (err) {
//       console.error("Daily finalize system error:", err);
//     }
//   }

//   // run every X minutes
//   setInterval(checkAndRun, CHECK_INTERVAL_MS);

//   // run once after startup
//   setTimeout(checkAndRun, 10_000);
// };

const finalize = require("../utils/dailyFinalize");

// ===== CONFIG =====
const CHECK_INTERVAL_MS = 5 * 60 * 1000; // every 5 min
const FINALIZE_HOUR_IST = 6;
const FINALIZE_MINUTE_IST = 0;
// ==================

function getISTDateInfo() {
  const now = new Date();

  const istTime = new Date(now.getTime() + (5 * 60 + 30) * 60 * 1000);

  const year = istTime.getUTCFullYear();
  const month = String(istTime.getUTCMonth() + 1).padStart(2, "0");
  const day = String(istTime.getUTCDate()).padStart(2, "0");

  return {
    dateStr: `${year}-${month}-${day}`,
    hour: istTime.getUTCHours(),
    minute: istTime.getUTCMinutes(),
  };
}

module.exports = function dailyFinalizeSystem(client) {
  async function checkAndRun() {
    try {
      const { dateStr, hour, minute } = getISTDateInfo();

      // ⛔ Not time yet (before 9:25 AM IST)
      if (
        hour < FINALIZE_HOUR_IST ||
        (hour === FINALIZE_HOUR_IST && minute < FINALIZE_MINUTE_IST)
      ) {
        return;
      }

      const redis = require("../redis");
      const guildId = process.env.GUILD_ID;

      const lockKey = `processed:${guildId}:${dateStr}`;

      const alreadyProcessed = await redis.get(lockKey);
      if (alreadyProcessed) return;

      console.log(
        `🔥 [FINALIZE] Running for ${dateStr} at ${hour}:${minute} IST`
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
