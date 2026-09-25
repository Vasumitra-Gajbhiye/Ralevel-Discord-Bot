// models/verbalWarning.js
// Verbal warnings are DMed to the user and kept for history only — they
// never add moderation points and never expire.
const mongoose = require("mongoose");

const VerbalWarningSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true,
  },

  userTag: {
    type: String,
    required: true,
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

  // Regulation cited (e.g. "1.1"), null if none
  ruleId: {
    type: String,
    default: null,
  },

  // Rule title at the time of the warning
  ruleTitle: {
    type: String,
    default: null,
  },

  actionId: {
    type: String,
    required: true,
    unique: true,
  },

  delReason: {
    type: String,
    default: "No verbal warning delete reason provided",
  },

  active: {
    type: Boolean,
    default: true,
  },

  timestamp: {
    type: Date,
    default: Date.now,
    index: true,
  },
});

module.exports =
  mongoose.models["VerbalWarning"] ||
  mongoose.model("VerbalWarning", VerbalWarningSchema);
