// models/modPoint.js
const mongoose = require("mongoose");

const ModPointSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },

    userTag: {
      type: String,
      default: null,
    },

    points: {
      type: Number,
      required: true,
    },

    source: {
      type: String,
      required: true, // "warn", "timeout", "kick", "softban", "manual"
      index: true,
    },

    // actionId of the warning / modlog entry that awarded these points
    sourceActionId: {
      type: String,
      default: null,
      index: true,
    },

    moderatorId: {
      type: String,
      required: true,
    },

    moderatorTag: {
      type: String,
      default: null,
    },

    reason: {
      type: String,
      default: "No reason provided",
    },

    active: {
      type: Boolean,
      default: true,
    },

    voidReason: {
      type: String,
      default: null,
    },

    voidedBy: {
      type: String,
      default: null,
    },

    voidedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

ModPointSchema.index({ userId: 1, active: 1, createdAt: -1 });

module.exports =
  mongoose.models["ModPoint"] || mongoose.model("ModPoint", ModPointSchema);
