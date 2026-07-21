const mongoose = require("mongoose");

const KickSchema = new mongoose.Schema({
  userId: {
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
  targetTag: {
    type: String,
  },
  actionId: {
    type: String,
    required: true,
    unique: true,
  },
  // active: {
  //   type: Boolean,
  //   default: true, // to revoke warnings later
  // },

  timestamp: {
    type: Date,
    default: Date.now,
    index: true,
  },
});

module.exports = mongoose.model("Kick", KickSchema);
