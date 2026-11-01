const mongoose = require("mongoose");
const { Schema, model } = mongoose;

// Expiry for grant records. Give Rep refuses messages older than this, so an
// expired record can never let the same giver rep the same message twice.
const REP_GRANT_TTL_SEC = 30 * 24 * 60 * 60;

// One reputation award per giver per message, shared by thank-you detection
// and the "Give Rep" context menu. The unique index is the dedupe.
const RepGrantSchema = new Schema(
  {
    messageId: { type: String, required: true },
    giverId: { type: String, required: true },
    receiverId: { type: String, required: true },
    createdAt: { type: Date, default: Date.now, expires: REP_GRANT_TTL_SEC },
  },
  { versionKey: false }
);

RepGrantSchema.index({ messageId: 1, giverId: 1 }, { unique: true });
// delete-my-data removes grants the member gave or received.
RepGrantSchema.index({ giverId: 1 });
RepGrantSchema.index({ receiverId: 1 });

const RepGrant = mongoose.models["RepGrant"] || model("RepGrant", RepGrantSchema);

module.exports = RepGrant;
module.exports.REP_GRANT_TTL_SEC = REP_GRANT_TTL_SEC;
