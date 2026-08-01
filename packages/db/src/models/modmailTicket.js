const mongoose = require("mongoose");

const ModmailTicketSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },

    threadId: {
      type: String,
      required: true,
      unique: true,
    },

    guildId: {
      type: String,
      required: true,
      index: true,
    },

    category: {
      type: String,
      default: null,
    },

    status: {
      type: String,
      enum: ["OPEN", "CLOSED"],
      default: "OPEN",
      index: true,
    },

    closedBy: {
      type: String,
      default: null,
    },

    closedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

ModmailTicketSchema.index({ userId: 1, status: 1 });

const ModmailTicket =
  mongoose.models["ModmailTicket"] ||
  mongoose.model("ModmailTicket", ModmailTicketSchema);

async function dropLegacyIndexes(collection) {
  let indexes = [];
  try {
    indexes = await collection.indexes();
  } catch (err) {
    if (err?.codeName !== "NamespaceNotFound" && err?.code !== 26) {
      throw err;
    }
    return;
  }

  for (const idx of indexes) {
    if (!idx?.name || idx.name === "_id_") continue;

    const keys = Object.keys(idx.key || {});
    const isLegacyChannelId = keys.length === 1 && keys[0] === "channelId";
    // Brief forum-v1 schema made userId unique; v2 allows many tickets per user.
    const isLegacyUniqueUserId =
      keys.length === 1 && keys[0] === "userId" && idx.unique === true;

    if (!isLegacyChannelId && !isLegacyUniqueUserId) continue;

    try {
      await collection.dropIndex(idx.name);
      console.log(`[modmail] Dropped legacy index: ${idx.name}`);
    } catch (err) {
      if (err?.code !== 27 && err?.codeName !== "IndexNotFound") {
        console.warn(`[modmail] Failed to drop index ${idx.name}:`, err.message);
      }
    }
  }
}

/**
 * Old channel-based tickets have no threadId (or null). Unique threadId_1 cannot
 * build while multiple docs share null. Give each a stable unique placeholder and
 * mark them closed so they never collide with live forum tickets.
 */
async function migrateLegacyModmailDocs(collection) {
  const legacyDocs = await collection
    .find({
      $or: [
        { threadId: { $exists: false } },
        { threadId: null },
        { threadId: "" },
      ],
    })
    .project({ _id: 1, channelId: 1, closedBy: 1, closedAt: 1 })
    .toArray();

  if (!legacyDocs.length) return 0;

  let fixed = 0;
  for (const doc of legacyDocs) {
    const threadId =
      (typeof doc.channelId === "string" && doc.channelId) ||
      `legacy:${doc._id.toString()}`;

    await collection.updateOne(
      { _id: doc._id },
      {
        $set: {
          threadId,
          status: "CLOSED",
          closedBy: doc.closedBy || "system",
          closedAt: doc.closedAt || new Date(),
        },
        $unset: { channelId: "" },
      }
    );
    fixed += 1;
  }

  console.log(`[modmail] Migrated ${fixed} legacy ticket doc(s) missing threadId`);
  return fixed;
}

/**
 * Drop leftover unique indexes, migrate legacy docs, then sync schema indexes.
 * Never throws — production boot must not die on index repair.
 */
async function ensureModmailIndexes() {
  try {
    const collection = ModmailTicket.collection;

    await dropLegacyIndexes(collection);
    await migrateLegacyModmailDocs(collection);

    try {
      await ModmailTicket.syncIndexes();
    } catch (err) {
      // Unique index build can still race/fail if leftover nulls remain.
      // Migrate again, drop threadId_1 if present, then recreate via syncIndexes.
      console.warn(
        "[modmail] syncIndexes failed; repairing threadId uniqueness:",
        err.message
      );
      await migrateLegacyModmailDocs(collection);

      try {
        await collection.dropIndex("threadId_1");
        console.log("[modmail] Dropped broken threadId_1 index for rebuild");
      } catch (dropErr) {
        if (
          dropErr?.code !== 27 &&
          dropErr?.codeName !== "IndexNotFound"
        ) {
          console.warn(
            "[modmail] Could not drop threadId_1:",
            dropErr.message
          );
        }
      }

      await ModmailTicket.syncIndexes();
    }

    console.log("[modmail] Indexes ensured");
  } catch (err) {
    console.error("[modmail] ensureModmailIndexes failed (non-fatal):", err);
  }
}

ModmailTicket.ensureModmailIndexes = ensureModmailIndexes;

module.exports = ModmailTicket;
