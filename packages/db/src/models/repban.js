const { Schema, model } = require("mongoose");

const RepBanSchema = new Schema(
  {
    userId: { type: String, required: true, index: true, unique: true },
    reason: { type: String },
  },
  { timestamps: true }
);

module.exports = model("RepBan", RepBanSchema);