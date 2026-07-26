const mongoose = require("mongoose");
const { Schema, model } = mongoose;

const XpBanSchema = new Schema(
  {
    userId: { type: String, required: true, index: true, unique: true },
    reason: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.models["XpBan"] || model("XpBan", XpBanSchema);
