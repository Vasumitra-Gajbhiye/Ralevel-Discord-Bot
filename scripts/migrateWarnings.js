const mongoose = require("mongoose");
const { Client, GatewayIntentBits } = require("discord.js");
require("dotenv").config();
const ModLog = require("../models/modlog");
const Warning = require("../models/warning");

const MONGO_URI = process.env.MONGO_URI;
const DISCORD_TOKEN = process.env.TOKEN;

// Create Discord client
const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

async function migrateWarnings() {
  await mongoose.connect(MONGO_URI);
  console.log("✅ Connected to DB");

  await client.login(DISCORD_TOKEN);
  console.log("✅ Logged into Discord");

  const warns = await ModLog.find({ action: "warn" });
  console.log(`Found ${warns.length} warnings to migrate`);

  let migrated = 0;
  let skipped = 0;
  let missingTags = 0;

  for (const warn of warns) {
    try {
      // prevent duplicates
      const exists = await Warning.findOne({ actionId: warn.actionId });
      if (exists) {
        skipped++;
        continue;
      }

      let userTag = warn.targetTag;

      // 🔥 Fetch from Discord if missing
      if (!userTag) {
        try {
          const user = await client.users.fetch(warn.userId);
          userTag = user.tag; // e.g. username#1234
        } catch (err) {
          missingTags++;
          userTag = `Unknown#${warn.userId.slice(-4)}`;
        }
      }

      await Warning.create({
        userId: warn.userId,
        userTag,
        moderatorId: warn.moderatorId,
        reason: warn.reason,
        actionId: warn.actionId,
        delReason: warn.warningDelReason || "No warning delete reason provided",
        active: true,
        timestamp: warn.timestamp,
      });

      migrated++;
    } catch (err) {
      console.error(`❌ Error migrating ${warn.actionId}`, err);
    }
  }

  console.log(`\n🎉 DONE`);
  console.log(`✅ Migrated: ${migrated}`);
  console.log(`⏭️ Skipped: ${skipped}`);
  console.log(`⚠️ Missing userTag (even after fetch): ${missingTags}`);

  await mongoose.disconnect();
  client.destroy();
}

migrateWarnings();
