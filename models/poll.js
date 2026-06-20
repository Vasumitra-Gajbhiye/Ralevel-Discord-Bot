const mongoose = require("mongoose");

const VoteSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    optionIds: [{ type: String }],
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const PollOptionSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    label: { type: String, required: true },
  },
  { _id: false },
);

const PollSchema = new mongoose.Schema(
  {
    pollId: {
      type: Number,
      unique: true,
      index: true,
    },
    guildId: {
      type: String,
      required: true,
      index: true,
    },
    channelId: {
      type: String,
      required: true,
    },
    messageId: {
      type: String,
      default: null,
      index: true,
    },
    question: {
      type: String,
      required: true,
    },
    options: {
      type: [PollOptionSchema],
      required: true,
    },
    allowedRoleIds: {
      type: [String],
      required: true,
    },
    choiceType: {
      type: String,
      enum: ["single", "multiple"],
      required: true,
    },
    status: {
      type: String,
      enum: ["active", "closed"],
      default: "active",
      index: true,
    },
    deadline: {
      type: Date,
      default: null,
      index: true,
    },
    createdBy: {
      type: String,
      required: true,
    },
    votes: {
      type: [VoteSchema],
      default: [],
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true },
);

PollSchema.index({ status: 1, deadline: 1 });

module.exports = mongoose.model("Poll", PollSchema);
