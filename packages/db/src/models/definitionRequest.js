// models/definitionRequest.js
// Anything about definitions that needs a reviewer: new definitions from
// members without subject rights, edit suggestions and deletion requests.
const mongoose = require("mongoose");

const ContentSchema = new mongoose.Schema(
  {
    term: { type: String, default: "" },
    definition: { type: String, default: "" },
    chapter: { type: String, default: "" },
    topic: { type: String, default: "" },
  },
  { _id: false },
);

const DefinitionRequestSchema = new mongoose.Schema(
  {
    requestId: { type: Number, required: true, unique: true },

    type: {
      type: String,
      enum: ["create", "edit", "delete"],
      required: true,
    },

    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },

    // Target for edit/delete; the new definition's ID once a create is approved
    definitionId: { type: Number, default: null, index: true },

    // Definition.revision the suggestion was written against (edit only)
    baseRevision: { type: Number, default: null },

    subjectId: { type: String, required: true },
    boardId: { type: String, default: "" },

    // Normalised proposed term (create), for duplicate checks
    termKey: { type: String, default: "" },

    // What the requester wants the definition to be (create/edit)
    proposed: { type: ContentSchema, default: () => ({}) },

    // Snapshot of the definition when the request was made (edit/delete)
    original: { type: ContentSchema, default: null },

    // Requester's explanation (edit) or reason (delete)
    note: { type: String, default: "" },

    requesterId: { type: String, required: true },
    requesterTag: { type: String, default: "" },

    reviewerId: { type: String, default: null },
    reviewerTag: { type: String, default: null },
    reviewedAt: { type: Date, default: null },
    rejectReason: { type: String, default: "" },

    // Reviewer changed the proposal via "Edit & approve"
    reviewerEdited: { type: Boolean, default: false },

    reviewChannelId: { type: String, default: null },
    reviewMessageId: { type: String, default: null },
  },
  { timestamps: true },
);

DefinitionRequestSchema.index({ requesterId: 1, status: 1 });
DefinitionRequestSchema.index({ status: 1, createdAt: -1 });

module.exports =
  mongoose.models["DefinitionRequest"] ||
  mongoose.model("DefinitionRequest", DefinitionRequestSchema);
