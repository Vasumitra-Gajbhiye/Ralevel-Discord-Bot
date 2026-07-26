require("../loadEnv");
const mongoose = require("mongoose");

async function migrateTaskSelectedToArray() {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is required");
  }

  await mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  const collection = mongoose.connection.collection("tasks");

  const stringSelected = await collection.updateMany(
    { selected: { $type: "string" } },
  [
    {
      $set: {
        selected: {
          $cond: [
            { $and: [{ $ne: ["$selected", null] }, { $ne: ["$selected", ""] }] },
            ["$selected"],
            [],
          ],
        },
      },
    },
  ]);

  const nullSelected = await collection.updateMany(
    { selected: null },
    { $set: { selected: [] } },
  );

  const missingSelected = await collection.updateMany(
    { selected: { $exists: false } },
    { $set: { selected: [] } },
  );

  console.log(
    `✅ Migrated task.selected to arrays: ` +
      `${stringSelected.modifiedCount} string values, ` +
      `${nullSelected.modifiedCount} null values, ` +
      `${missingSelected.modifiedCount} missing fields`,
  );

  await mongoose.disconnect();
}

migrateTaskSelectedToArray().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
