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
      enum: ["general", "advertise", "report"],
      // Optional so legacy pre-v2 docs can be closed/updated without validation errors.
      // New tickets always set category explicitly.
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

/**
 * Drop legacy unique indexes left over from earlier modmail designs, then sync
 * the current schema indexes. Safe to call on every boot.
 */
async function ensureModmailIndexes() {
  const collection = ModmailTicket.collection;

  let indexes = [];
  try {
    indexes = await collection.indexes();
  } catch (err) {
    if (err?.codeName !== "NamespaceNotFound" && err?.code !== 26) {
      throw err;
    }
  }

  for (const idx of indexes) {
    if (!idx?.name || idx.name === "_id_") continue;

    const keys = Object.keys(idx.key || {});
    const isLegacyChannelId =
      keys.length === 1 && keys[0] === "channelId";
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

  await ModmailTicket.syncIndexes();
}

ModmailTicket.ensureModmailIndexes = ensureModmailIndexes;

module.exports = ModmailTicket;
