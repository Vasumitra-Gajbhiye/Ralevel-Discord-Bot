// REPUTATION model
const { Schema, model } = require("mongoose");

const ReputationSchema = new Schema(
  {
    userId: { type: String, required: true, index: true, unique: true },
    rep: { type: Number, required: true, default: 0 },
  },
  { timestamps: true }
);

module.exports = model("Reputation", ReputationSchema);
