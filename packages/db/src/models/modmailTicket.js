const mongoose = require("mongoose");

const ModmailTicketSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      unique: true,
    },

    threadId: {
      type: String,
      required: true,
      unique: true,
    },

    guildId: {
      type: String,
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

module.exports =
  mongoose.models["ModmailTicket"] ||
  mongoose.model("ModmailTicket", ModmailTicketSchema);
