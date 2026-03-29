require("dotenv").config();

const redis = require("./redis");
const connectDB = require("./database");
const User = require("./models/User");

const { exec } = require("child_process");

const GUILD_ID = "1430847370807083132";

// 🧠 Helpers
function getYesterdayDate() {
  const now = new Date();
  now.setDate(now.getDate() - 1);
  return now.toISOString().split("T")[0];
}

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

async function runTest() {
  try {
    await connectDB();

    const date = getYesterdayDate();

    const user1 = "1058932081629069363"; // booster
    const user2 = "878194355473637397"; // normal

    const key1 = `messages:${GUILD_ID}:${date}:${user1}`;
    const key2 = `messages:${GUILD_ID}:${date}:${user2}`;

    const lockKey = `processed:${GUILD_ID}:${date}`;

    console.log("🧪 Setting up test data...");

    // 🧹 Clean previous leftovers
    await redis.del(key1);
    await redis.del(key2);
    await redis.del(lockKey);
    await User.deleteMany({ _id: { $in: [user1, user2] } });

    // 🔥 Insert test data
    await redis.hset(key1, { count: 10, booster: "true" }); // should give 20 XP
    await redis.hset(key2, { count: 10, booster: "false" }); // should give 5 XP

    console.log("✅ Test data inserted");

    // ▶️ Run finalize script
    console.log("🚀 Running finalize script...");
    await new Promise((resolve, reject) => {
      exec("node utils/dailyFinalize.js", (err, stdout, stderr) => {
        if (err) return reject(err);
        console.log(stdout);
        if (stderr) console.error(stderr);
        resolve();
      });
    });

    await sleep(1000);

    // 🔍 Check Mongo results
    console.log("📊 Checking MongoDB...");

    const u1 = await User.findById(user1);
    const u2 = await User.findById(user2);

    console.log("User 1 (booster):", u1);
    console.log("User 2 (normal):", u2);

    console.log("\n🧠 Expected:");
    console.log("User 1 XP = 20");
    console.log("User 2 XP = 5");

    // 🧹 Cleanup after test
    console.log("\n🧹 Cleaning up...");

    await User.deleteMany({ _id: { $in: [user1, user2] } });
    await redis.del(key1);
    await redis.del(key2);
    await redis.del(lockKey);

    console.log("✅ Cleanup done");

    process.exit(0);
  } catch (err) {
    console.error("❌ Test failed:", err);
    process.exit(1);
  }
}

runTest();
