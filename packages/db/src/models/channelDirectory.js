const mongoose = require("mongoose");

/**
 * The guild's live channel list, published by the bot (systems/channelDirectory.js)
 * so the dashboard can offer real channel pickers. One document per guild;
 * the bot is the only writer.
 */

const CHANNEL_DIRECTORY_TYPES = [
  "text",
  "announcement",
  "forum",
  "media",
  "voice",
  "stage",
  "category",
];

const DirectoryChannelSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    type: { type: String, enum: CHANNEL_DIRECTORY_TYPES, required: true },
    // Category the channel sits in; null for categories and uncategorised channels
    parentId: { type: String, default: null },
    // Discord's raw position (ordering within the parent)
    position: { type: Number, default: 0 },
  },
  { _id: false },
);

const ChannelDirectorySchema = new mongoose.Schema(
  {
    guildId: { type: String, required: true, unique: true },
    channels: { type: [DirectoryChannelSchema], default: [] },
  },
  { timestamps: true },
);

module.exports =
  mongoose.models["ChannelDirectory"] ||
  mongoose.model("ChannelDirectory", ChannelDirectorySchema);
