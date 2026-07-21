// REPUTATION model
const mongoose = require("mongoose");
const { Schema, model } = mongoose;

const ReputationSchema = new Schema(
  {
    userId: { type: String, required: true, index: true, unique: true },
    rep: { type: Number, required: true, default: 0 },
  },
  { timestamps: true }
);

ReputationSchema.index({ rep: -1 });

module.exports = mongoose.models["Reputation"] || model("Reputation", ReputationSchema);
