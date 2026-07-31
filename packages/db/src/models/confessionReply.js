const mongoose = require("mongoose");

const ConfessionReplySchema = new mongoose.Schema(
  {
    confessionId: {
      type: Number,
      required: true,
      index: true,
    },

    authorId: {
      type: String,
      required: true,
      index: true,
    },

    anonymousNumber: {
      type: Number,
      required: true,
    },

    content: {
      type: String,
      required: true,
    },

    attachment: {
      type: String,
      default: null,
    },

    messageId: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports =
  mongoose.models["ConfessionReply"] ||
  mongoose.model("ConfessionReply", ConfessionReplySchema);
