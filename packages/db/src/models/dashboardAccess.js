const mongoose = require("mongoose");
const { Schema, model } = mongoose;

const DashboardAccessSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    name: { type: String, default: "", trim: true },
  },
  { timestamps: true },
);

module.exports =
  mongoose.models.DashboardAccess ||
  model("DashboardAccess", DashboardAccessSchema);
