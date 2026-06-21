const mongoose = require("mongoose");

const taskDisplaySchema = new mongoose.Schema(
  {
    team: {
      type: String,
      enum: ["graphic", "dev", "writer"],
      required: true,
      unique: true,
    },
    channelId: {
      type: String,
      required: true,
    },
    displayMessageId: {
      type: String,
      default: null,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("TaskDisplay", taskDisplaySchema);
