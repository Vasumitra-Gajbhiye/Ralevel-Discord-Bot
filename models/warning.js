const mongoose = require("mongoose");

const WarningSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true,
  },

  userTag: {
    type: String,
    required: true,
    index: true,
  },

  moderatorId: {
    type: String,
    required: true,
  },

  reason: {
    type: String,
    default: "No reason provided",
  },

  actionId: {
    type: String,
    required: true,
    unique: true,
  },
  delReason: {
    type: String,
    default: "No warning delete reason provided",
  },
  active: {
    type: Boolean,
    default: true, // useful if you want to revoke warnings later
  },

  timestamp: {
    type: Date,
    default: Date.now,
    index: true,
  },
});

module.exports = mongoose.model("Warning", WarningSchema);
