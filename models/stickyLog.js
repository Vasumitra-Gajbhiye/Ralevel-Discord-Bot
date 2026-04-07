const mongoose = require("mongoose");

const StickyLogSchema = new mongoose.Schema(
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
    },

    moderatorId: {
      type: String,
      required: true,
      index: true,
    },

    moderatorTag: {
      type: String,
      required: true,
    },

    action: {
      type: String,
      enum: ["ADD", "EDIT", "REMOVE", "RESEND"],
      required: true,
      index: true,
    },

    content: {
      type: String,
      default: null,
      maxlength: 2000, // prevent abuse
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("StickyLog", StickyLogSchema);
