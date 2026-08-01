const mongoose = require("mongoose");

const TIME_UTC_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const ExamSessionSchema = new mongoose.Schema(
  {
    guildId: {
      type: String,
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    amStartUtc: {
      type: String,
      required: true,
      validate: {
        validator: (v) => TIME_UTC_RE.test(v),
        message: "amStartUtc must be HH:mm UTC",
      },
    },
    amEndUtc: {
      type: String,
      required: true,
      validate: {
        validator: (v) => TIME_UTC_RE.test(v),
        message: "amEndUtc must be HH:mm UTC",
      },
    },
    pmStartUtc: {
      type: String,
      required: true,
      validate: {
        validator: (v) => TIME_UTC_RE.test(v),
        message: "pmStartUtc must be HH:mm UTC",
      },
    },
    pmEndUtc: {
      type: String,
      required: true,
      validate: {
        validator: (v) => TIME_UTC_RE.test(v),
        message: "pmEndUtc must be HH:mm UTC",
      },
    },
    status: {
      type: String,
      enum: ["active", "archived"],
      default: "active",
      index: true,
    },
  },
  { timestamps: true },
);

ExamSessionSchema.index({ guildId: 1, status: 1 });

module.exports =
  mongoose.models["ExamSession"] ||
  mongoose.model("ExamSession", ExamSessionSchema);
