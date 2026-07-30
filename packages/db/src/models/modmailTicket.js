const mongoose = require("mongoose");

const ModmailTicketSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },

    channelId: {
      type: String,
      required: true,
      unique: true,
    },

    guildId: {
      type: String,
      required: true,
      index: true,
    },

    status: {
      type: String,
      enum: ["OPEN", "CLOSED"],
      default: "OPEN",
      index: true,
    },

    closedBy: {
      type: String,
      default: null,
    },

    closedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

ModmailTicketSchema.index({ userId: 1, status: 1 });

module.exports =
  mongoose.models["ModmailTicket"] ||
  mongoose.model("ModmailTicket", ModmailTicketSchema);
