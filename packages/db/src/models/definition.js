// models/definition.js
// Live (approved) glossary definitions shown by /define. Pending additions,
// edit suggestions and deletion requests live in DefinitionRequest.
const mongoose = require("mongoose");
const { normalizeTermKey } = require("../definitionsConfig");

const CONTENT_FIELDS = ["term", "definition", "chapter", "topic"];

const ContributorSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    userTag: { type: String, default: "" },
    at: { type: Date, default: Date.now },
  },
  { _id: false },
);

const DefinitionSchema = new mongoose.Schema(
  {
    definitionId: { type: Number, required: true, unique: true },

    // GuildConfig.definitions.subjects[].id
    subjectId: { type: String, required: true },

    // GuildConfig.definitions.boards[].id — "" means it applies to every board
    boardId: { type: String, default: "" },

    term: { type: String, required: true, trim: true },

    // Normalised term used for lookups and uniqueness (set automatically)
    termKey: { type: String, required: true },

    definition: { type: String, required: true },
    chapter: { type: String, default: "" },
    topic: { type: String, default: "" },

    authorId: { type: String, required: true, index: true },
    authorTag: { type: String, default: "" },

    // People whose improvements were applied (never includes the author)
    contributors: { type: [ContributorSchema], default: [] },

    // Bumped on every content change; stale edit suggestions compare against it
    revision: { type: Number, default: 1 },

    views: { type: Number, default: 0 },

    lastEditedById: { type: String, default: null },
    lastEditedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

DefinitionSchema.index(
  { subjectId: 1, boardId: 1, termKey: 1 },
  { unique: true },
);
DefinitionSchema.index({ termKey: 1 });
DefinitionSchema.index({ views: -1 });

DefinitionSchema.pre("validate", function setTermKey(next) {
  if (this.term) this.termKey = normalizeTermKey(this.term);
  next();
});

// Keeps termKey/revision correct for dashboard edits (findByIdAndUpdate).
DefinitionSchema.pre("findOneAndUpdate", function syncDerivedFields(next) {
  const update = this.getUpdate() || {};
  const set = { ...update, ...(update.$set || {}) };

  if (typeof set.term === "string") {
    this.set("termKey", normalizeTermKey(set.term));
  }

  const touchesContent = CONTENT_FIELDS.some((f) => set[f] !== undefined);
  if (touchesContent && update.$inc?.revision === undefined) {
    this.setUpdate({
      ...this.getUpdate(),
      $inc: { ...(update.$inc || {}), revision: 1 },
    });
  }
  next();
});

module.exports =
  mongoose.models["Definition"] ||
  mongoose.model("Definition", DefinitionSchema);
