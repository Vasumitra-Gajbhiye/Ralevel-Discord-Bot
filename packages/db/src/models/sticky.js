const mongoose = require("mongoose");

const StickySchema = new mongoose.Schema(
  {
    guildId: {
      type: String,
      required: true,
      index: true,
    },
    channelId: {
      type: String,
      required: true,
      index: true,
      unique: true, // 1 sticky per channel
    },
    content: {
      type: String,
      default: null, // markdown-enabled text
    },
    lineThreshold: {
      type: Number,
      default: 8,
      min: 1,
    },
    lastMessageId: {
      type: String,
      default: null,
    },
    enabled: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.models["Sticky"] || mongoose.model("Sticky", StickySchema);