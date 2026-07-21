// models/certificate.js
const mongoose = require("mongoose");

const CertificateSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  userTag: { type: String, required: true },
  type: { type: String, required: true }, 

  status: { 
    type: String, 
    enum: ["pending", "approved", "rejected", "details submitted", "completed and delivered"], 
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
});

module.exports = mongoose.model("CertificateApplication", CertificateSchema);