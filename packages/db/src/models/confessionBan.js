const mongoose = require("mongoose");

const ConfessionBanSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      unique: true,
      index: true,
    },

    bannedBy: {
      type: String,
      required: true,
    },

    reason: {
      type: String,
      default: null,
    },

    bannedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ConfessionBan", ConfessionBanSchema);