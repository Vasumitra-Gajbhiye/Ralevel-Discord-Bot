const mongoose = require("mongoose");

const QotdRotationSchema = new mongoose.Schema(
  {
    guildId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    modOrder: [
      {
        id: { type: String, required: true },
        tag: { type: String, required: true },
      },
    ],

    currentIndex: {
      type: Number,
      required: true,
      default: 0,
    },

    // Stored as YYYY-MM-DD in IST
    lastReminderDate: {
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

module.exports = mongoose.model("QotdRotation", QotdRotationSchema);