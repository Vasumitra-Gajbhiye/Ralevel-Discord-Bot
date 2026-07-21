const mongoose = require("mongoose");

const NoteSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true,
  },

  userTag: {
    type: String,
    required: true,
  },

  authorId: {
    type: String,
    required: true,
  },

  content: {
    type: String,
    required: true,
  },

  actionId: {
    type: String,
    required: true,
    unique: true,
  },

  timestamp: {
    type: Date,
    default: Date.now,
    index: true,
  },
});

module.exports = mongoose.models["Note"] || mongoose.model("Note", NoteSchema);
