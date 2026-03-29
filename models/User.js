// models/User.js

const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    _id: {
      type: String, // user_id
      required: true,
    },
    guild_id: {
      type: String,
      required: true,
      index: true,
    },
    total_messages: {
      type: Number,
      default: 0,
    },
    xp: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("User", userSchema);
