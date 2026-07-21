const mongoose = require("mongoose");

const ConfessionSchema = new mongoose.Schema(
  {
    confessionId: {
      type: Number,
      unique: true,
      index: true,
    },
    threadId: {
      type: String,
      default: null,
    },
    content: {
      type: String,
      required: true,
    },

    attachment: {
      type: String, // URL
      default: null,
    },

    allowReply: {
      type: Boolean,
      default: true,
    },

    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED"],
      default: "PENDING",
      index: true,
    },

    authorId: {
      type: String,
      required: true,
      index: true,
    },

    modActionBy: {
      type: String,
      default: null,
    },

    rejectionReason: {
      type: String,
      default: null,
    },

    postedMessageId: {
      type: String,
      default: null,
    },

    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },

    reviewedAt: {
      type: Date,
      default: null,
    },
  },

  { timestamps: true }
);

module.exports = mongoose.model("Confession", ConfessionSchema);
