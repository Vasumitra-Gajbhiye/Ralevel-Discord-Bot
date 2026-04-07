// models/modlog.js
const mongoose = require("mongoose");
const { Schema } = mongoose;
const ModLogSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true,
  },

  moderatorId: {
    type: String,
    required: true,
  },

  action: {
    type: String,
    required: true, // "warn", "ban", "role-add", etc
    index: true,
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

  targetTag: {
    type: String,
    required: true,
  },

  targetChannel: {
    type: String,
    default: null,
  },

  channelId: {
    type: String,
    default: null,
    index: true,
  },

  title: {
    type: String,
    default: null,
  },

  description: {
    type: String,
    default: null,
  },

  color: {
    type: String,
    default: null,
  },

  image: {
    type: String,
    default: null,
  },

  thumbnail: {
    type: String,
    default: null,
  },

  button: {
    label: { type: String, default: null },
    url: { type: String, default: null },
  },

  ping: {
    roleId: { type: String, default: null },
    everyone: { type: Boolean, default: false },
    here: { type: Boolean, default: false },
  },

  metadata: {
    type: Object, // extra info (role, duration, etc)
    default: {},
  },

  warningDelReason: {
    type: String,
    default: "No warning delete reason provided",
  },

  targetTag: {
    type: String,
  },

  deletedWarningId: {
    type: String,
  },

  warningDelReason: {
    type: String,
  },

  muteDuration: {
    type: String,
  },

  sayMessage: {
    type: String,
  },
  sayMsgEmbedBoolean: {
    type: String,
  },

  oldNickname: {
    type: String,
  },
  newNickname: {
    type: String,
  },

  slowModeDuration: {
    type: String,
  },

  timeourDuration: {
    type: String,
  },

  banAppealable: {
    type: String,
  },

  deletedMessages: {
    type: Schema.Types.Mixed,
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true,
  },
});

module.exports = mongoose.model("ModLog", ModLogSchema);
