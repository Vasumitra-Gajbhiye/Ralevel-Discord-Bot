const mongoose = require("mongoose");
const { Schema, model } = mongoose;

// Per-member privacy preferences set through /privacy. Survives
// delete-my-data so the opt-out (and the deletion cooldown) stick.
const UserPrivacySchema = new Schema(
  {
    userId: { type: String, required: true, unique: true },
    contentOptOut: { type: Boolean, required: true, default: false },
    dataDeletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Startup loads every opted-out member into memory.
UserPrivacySchema.index({ contentOptOut: 1 });

module.exports =
  mongoose.models["UserPrivacy"] || model("UserPrivacy", UserPrivacySchema);
