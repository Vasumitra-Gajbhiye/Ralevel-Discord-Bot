// models/certificate.js
const mongoose = require("mongoose");

const CertificateSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  userTag: { type: String, required: true },
  type: { type: String, required: true }, 

  status: { 
    type: String, 
    enum: [
      "pending",
      "approved",
      "rejected",
      "details submitted",
      "completed and delivered",
      "forfeited",
    ], 
    default: "pending" 
  },

  reason: { type: String, default: "" }, 
  moderatorId: { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
  resolvedAt: { type: Date, default: null },

  // Details submission
  legalName: { type: String, default: null },
  email: { type: String, default: null },
  detailsSubmittedAt: { type: Date, default: null },


  // After Delivery
  certLink: { type: String, default: null },
  certId: { type: String, default: null },
  deliveredAt: { type: Date, default: null },

  // Extra helpful fields
  rep: { type: Number, default: 0 },
  joinedAt: { type: Date, default: null },

  // Review channel message reference (for in-place embed updates)
  reviewMessageId: { type: String, default: null },
  reviewChannelId: { type: String, default: null },

  // Round-robin assignee + delivery reminders
  assignedAdminId: { type: String, default: null },
  assignedAdminTag: { type: String, default: null },
  reminder3SentAt: { type: Date, default: null },
  reminder7SentAt: { type: Date, default: null },
  lastAdminReminderSentAt: { type: Date, default: null },
  lastAdminReminderDay: { type: Number, default: null },

  // Scheduled forfeit (status stays approved / details submitted until executed)
  forfeitAt: { type: Date, default: null },
  forfeitReason: { type: String, default: "" },
  forfeitAction: { type: String, default: "" },
  forfeitScheduledAt: { type: Date, default: null },
  forfeitModeratorId: { type: String, default: null },
  forfeitDays: { type: Number, default: null },
});

module.exports = mongoose.models["CertificateApplication"] || mongoose.model("CertificateApplication", CertificateSchema);