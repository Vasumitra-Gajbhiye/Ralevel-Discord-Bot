const mongoose = require("mongoose");
const { Schema, model } = mongoose;

const XpFlushGrantSchema = new Schema(
  {
    guildId: { type: String, required: true },
    flushId: { type: String, required: true },
    userId: { type: String, required: true },
    messages: { type: Number, required: true, default: 0 },
    xp: { type: Number, required: true, default: 0 },
    dateIst: { type: String, required: true },
    applied: { type: Boolean, required: true, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

XpFlushGrantSchema.index(
  { guildId: 1, flushId: 1, userId: 1 },
  { unique: true }
);

module.exports =
  mongoose.models["XpFlushGrant"] || model("XpFlushGrant", XpFlushGrantSchema);
