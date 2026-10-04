const mongoose = require("mongoose");

/**
 * One document per user for moderator-initiated DM conversations.
 * The same forum post is reused every time a mod reopens a conversation,
 * so the full history with a user stays in one place.
 */
const ModDmSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      unique: true,
    },

    guildId: {
      type: String,
      required: true,
    },

    threadId: {
      type: String,
      default: null,
      index: true,
    },

    status: {
      type: String,
      enum: ["OPEN", "CLOSED"],
      default: "CLOSED",
      index: true,
    },

    // Incremented on every open so stale DM buttons can't close a newer conversation.
    session: {
      type: Number,
      default: 0,
    },

    openedBy: {
      type: String,
      default: null,
    },

    openedAt: {
      type: Date,
      default: null,
    },

    // Moderator ID, the user's own ID, or "system".
    closedBy: {
      type: String,
      default: null,
    },

    closedAt: {
      type: Date,
      default: null,
    },

    closeReason: {
      type: String,
      default: null,
    },

    introMessageId: {
      type: String,
      default: null,
    },

    // Set when the user chooses "Don't DM me again".
    optedOutAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports =
  mongoose.models["ModDm"] || mongoose.model("ModDm", ModDmSchema);
