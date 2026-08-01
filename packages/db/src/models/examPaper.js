const mongoose = require("mongoose");

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const ExamPaperSchema = new mongoose.Schema(
  {
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ExamSession",
      required: true,
      index: true,
    },
    guildId: {
      type: String,
      required: true,
      index: true,
    },
    label: {
      type: String,
      required: true,
      trim: true,
    },
    date: {
      type: String,
      required: true,
      validate: {
        validator: (v) => DATE_RE.test(v),
        message: "date must be YYYY-MM-DD",
      },
    },
    slot: {
      type: String,
      enum: ["AM", "PM"],
      required: true,
    },
    channelIds: {
      type: [String],
      required: true,
      validate: {
        validator: (ids) => Array.isArray(ids) && ids.length > 0,
        message: "At least one channelId is required",
      },
    },
    lockAt: {
      type: Date,
      required: true,
      index: true,
    },
    unlockAt: {
      type: Date,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["scheduled", "locked", "unlocked", "cancelled"],
      default: "scheduled",
      index: true,
    },
    lockedAt: {
      type: Date,
      default: null,
    },
    unlockedAt: {
      type: Date,
      default: null,
    },
    forceUnlock: {
      type: Boolean,
      default: false,
      index: true,
    },
    cancelAfterUnlock: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

ExamPaperSchema.index({ status: 1, lockAt: 1 });
ExamPaperSchema.index({ status: 1, unlockAt: 1 });
ExamPaperSchema.index({ sessionId: 1, status: 1 });
ExamPaperSchema.index({ channelIds: 1, status: 1 });

module.exports =
  mongoose.models["ExamPaper"] || mongoose.model("ExamPaper", ExamPaperSchema);
