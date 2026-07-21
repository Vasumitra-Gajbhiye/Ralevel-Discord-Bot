const mongoose = require("mongoose");

const helperSchema = new mongoose.Schema({
  channelId: { type: String, required: true, unique: true },
  roleId: { type: String, required: true }
});

module.exports = mongoose.models["HelperRole"] || mongoose.model("HelperRole", helperSchema);