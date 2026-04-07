require("dotenv").config();
const mongoose = require("mongoose");
const ModLog = require("../models/modlog"); // old
const Warning = require("../models/warning"); // new

const MONGO_URI = process.env.MONGO_URI;

async function migrateWarnings() {
  await mongoose.connect(MONGO_URI);
  console.log("Connected to DB");

  // 1. Fetch all warn actions
  const warns = await ModLog.find({ action: "warn" });

  console.log(`Found ${warns.length} warnings to migrate`);

  let migrated = 0;
  let skipped = 0;

  for (const warn of warns) {
    try {
      // prevent duplicate migration
      const exists = await Warning.findOne({ actionId: warn.actionId });
      if (exists) {
        skipped++;
        continue;
      }

      await Warning.create({
        userId: warn.userId,
        userTag: warn.targetTag,
        moderatorId: warn.moderatorId,
        reason: warn.reason,
        actionId: warn.actionId,
        delReason: warn.warningDelReason || "No warning delete reason provided",
        active: true,
        timestamp: warn.timestamp,
      });

      migrated++;
    } catch (err) {
      console.error(`Error migrating ${warn.actionId}`, err);
    }
  }

  console.log(`✅ Migrated: ${migrated}`);
  console.log(`⏭️ Skipped: ${skipped}`);

  await mongoose.disconnect();
}

migrateWarnings();
