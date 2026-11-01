const { UserPrivacy } = require("@ralevel/db");

// Checked on every guild message, so it lives in memory: loaded once at
// startup and kept current by /privacy message-content.
const optedOutIds = new Set();

async function loadContentOptOuts() {
  const docs = await UserPrivacy.find({ contentOptOut: true })
    .select("userId")
    .lean();
  optedOutIds.clear();
  for (const doc of docs) optedOutIds.add(doc.userId);
  console.log(`[privacy] Loaded ${optedOutIds.size} message-content opt-outs`);
  return optedOutIds.size;
}

function isContentOptedOut(userId) {
  return optedOutIds.has(userId);
}

async function setContentOptOut(userId, optedOut) {
  await UserPrivacy.updateOne(
    { userId },
    { $set: { contentOptOut: optedOut } },
    { upsert: true }
  );
  if (optedOut) optedOutIds.add(userId);
  else optedOutIds.delete(userId);
}

module.exports = {
  loadContentOptOuts,
  isContentOptedOut,
  setContentOptOut,
};
