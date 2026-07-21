const mongoose = require("mongoose");

const PollVoteSchema = new mongoose.Schema(
  {
    pollId: {
      type: Number,
      required: true,
      index: true,
    },
    userId: {
      type: String,
      required: true,
    },
    optionIds: {
      type: [String],
      default: [],
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: false },
);

PollVoteSchema.index({ pollId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.models["PollVote"] || mongoose.model("PollVote", PollVoteSchema);
