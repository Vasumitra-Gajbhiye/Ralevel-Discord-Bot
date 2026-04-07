const { EmbedBuilder } = require("discord.js");
const ModLog = require("../models/modlog");

module.exports = async function logModAction({
  interaction,
  userId = "Not Provided",
  userTag = "Not Provided",
  moderatorTag = "Not Provided",
  moderatorId = "Not Provided",
  action = "Not Provided",
  targetTag = "Not Provided",
  reason = "Not Provided",
  actionId = "Not Provided",
  channelTag = "Not Provided",
  channelId = "Not Provided",
  title = "Not Provided",
  description = "Not Provided",
  color = "Not Provided",
  image = "Not Provided",
  thumbnail = "Not Provided",
  button = "Not Provided",
  ping = "Not Provided",
  // targetChannel = "Not Provided",
  role = "Not Provided",
  deletedWarningId = "Not Provided",
  warningDelReason = "Not Provided",
  muteDuration = "Not Provided",
  numberOfPurgeMessages = "Not Provided",
  purgeFilter = "Not Provided",
  purgeKeyword = "Not Provided",
  purgeHours = "Not Provided",
  sayMessage = "Not Provided",
  sayMsgEmbedBoolean = "Not Provided",
  oldNickname = "Not Provided",
  newNickname = "Not Provided",
  slowModeDuration = "Not Provided",
  timeourDuration = "Not Provided",
  banAppealable = "Not Provided",
  deletedMessages = "Not Provided",
}) {
  if (!moderatorId || !interaction || !actionId) {
    console.error("Invalid logModAction params", {
      interaction,
      moderatorId,
      // target,
      actionId,
    });
    return;
  }

  // 1. Save to DB
  try {
    const doc = await ModLog.create({
      userId: userId,
      moderatorId: moderatorId,
      action: action,
      targetTag: targetTag,
      reason: reason || "No reason provided",
      actionId: actionId,

      // 🔥 structured fields
      channelTag,
      channelId: channelId,
      title: title,
      description: description,
      color: color,
      image: image,
      thumbnail: thumbnail,
      button: button,
      ping: ping,

      // targetChannel: targetChannel,
      role,

      deletedWarningId,
      warningDelReason,
      numberOfPurgeMessages,
      purgeFilter,
      purgeKeyword,
      purgeHours,
      muteDuration,
      // fallback
      // metadata: extra,
      sayMessage,
      sayMsgEmbedBoolean,

      slowModeDuration,

      timeourDuration,

      oldNickname,
      newNickname,

      banAppealable,
      deletedMessages,
      timestamp: new Date(),
    });

    console.log("✅ ModLog saved:", doc.actionId);
  } catch (err) {
    console.error("❌ Failed to save mod log:", err);
  }

  // 2. Send to log channel
  const logChannelId = process.env.MOD_LOG_CHANNEL_ID;

  if (!logChannelId) {
    console.error("MOD_LOG_CHANNEL_ID is not set in .env");
    return;
  }

  let channel;
  try {
    channel = await interaction.client.channels.fetch(logChannelId);
  } catch (err) {
    console.error("❌ Log channel fetch failed:", err);
    return;
  }

  if (!channel || !channel.send) {
    console.error("❌ Invalid log channel");
    return;
  }

  const prettyAction = action
    .split("-")
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");

  let embed;
  if (action === "role-add") {
    embed = new EmbedBuilder()
      .setTitle(`🔨 ${prettyAction}`)
      .setColor(0xfb8500)
      .addFields(
        { name: "User", value: `${userTag} (${userId})` },
        { name: "Moderator", value: moderatorTag },
        { name: "Reason", value: reason || "No reason provided" },
        { name: "Action ID", value: actionId },
        { name: "Role Added", value: role }
      )
      .setTimestamp();
  } else if (action === "role-remove") {
    embed = new EmbedBuilder()
      .setTitle(`🔨 ${prettyAction}`)
      .setColor(0xfb8500)
      .addFields(
        { name: "User", value: `${userTag} (${userId})` },
        { name: "Moderator", value: moderatorTag },
        { name: "Reason", value: reason || "No reason provided" },
        { name: "Action ID", value: actionId },
        { name: "Role Removed", value: role }
      )
      .setTimestamp();
  } else if (action === "slowmode") {
    embed = new EmbedBuilder()
      .setTitle(`🔨 ${prettyAction}`)
      .setColor(0xfb8500)
      .addFields(
        {
          name: "Slow Mode Duration",
          value: String(slowModeDuration || "N/A"),
        },
        { name: "Moderator", value: moderatorTag },
        { name: "Reason", value: reason || "No reason provided" },
        { name: "Action ID", value: actionId },
        { name: "Channel", value: String(`${channelTag} (${channelId})`) }
      )
      .setTimestamp();
  } else if (action === "announce") {
    embed = new EmbedBuilder()
      .setTitle(`🔨 ${prettyAction}`)
      .setColor(0xffb703)
      .addFields(
        { name: "Channel", value: String(`${channelTag} (${channelId})`) },
        { name: "Moderator", value: String(moderatorTag) },
        { name: "Reason", value: String(reason || "No reason provided") },
        { name: "Action ID", value: String(actionId) },
        { name: "Title", value: String(title || "N/A") },
        { name: "Description", value: String(description || "N/A") },
        { name: "Color", value: String(color || "N/A") },
        { name: "Image", value: String(image || "N/A") },
        { name: "Thumbnail", value: String(thumbnail || "N/A") },
        {
          name: "Button Label",
          value: button?.label ? String(button.label) : "N/A",
        },
        {
          name: "Button URL",
          value: button?.buttonUrl ? String(button.buttonUrl) : "N/A",
        },
        {
          name: "Ping",
          value:
            typeof ping === "object"
              ? `RoleId: ${ping.roleId || "N/A"}\nEveryone: ${
                  ping.everyone
                }\nHere: ${ping.here}`
              : "N/A",
        }
      )
      .setTimestamp();
  } else if (action === "warning-delete") {
    embed = new EmbedBuilder()
      .setTitle(`🔨 ${prettyAction}`)
      .setColor(0x8ecae6)
      .addFields(
        { name: "User", value: `${userTag || "N/A"} (${userId || "N/A"})` },
        { name: "Moderator", value: moderatorTag },
        {
          name: "Reason For Warning",
          value: String(reason || "No reason provided"),
        },
        { name: "Warning Delete Reason", value: warningDelReason },
        { name: "Action ID", value: actionId },
        { name: "Deleted Warning Id", value: deletedWarningId }
      )
      .setTimestamp();
  } else if (action === "lock-channel") {
    embed = new EmbedBuilder()
      .setTitle(`🔨 ${prettyAction}`)
      .setColor(0x8ecae6)
      .addFields(
        { name: "Moderator", value: moderatorTag },
        { name: "Reason ", value: String(reason || "No reason provided") },
        { name: "Action ID", value: actionId },
        { name: "Lock Channel", value: `${channelTag} (${channelId})` }
      )
      .setTimestamp();
  } else if (action === "unlock-channel") {
    embed = new EmbedBuilder()
      .setTitle(`🔨 ${prettyAction}`)
      .setColor(0x8ecae6)
      .addFields(
        { name: "Moderator", value: moderatorTag },
        { name: "Reason ", value: String(reason || "No reason provided") },
        { name: "Action ID", value: actionId },
        { name: "Unlock Channel", value: `${channelTag} (${channelId})` }
      )
      .setTimestamp();
  } else if (action === "mute") {
    embed = new EmbedBuilder()
      .setTitle(`🔨 ${prettyAction}`)
      .setColor(0x8ecae6)
      .addFields(
        { name: "User", value: `${userTag || "N/A"} (${userId || "N/A"})` },
        { name: "Moderator", value: moderatorTag },
        { name: "Reason ", value: String(reason || "No reason provided") },
        { name: "Action ID", value: actionId },
        { name: "Mute Duration", value: muteDuration }
      )
      .setTimestamp();
  } else if (action === "pin-message") {
    embed = new EmbedBuilder()
      .setTitle(`🔨 ${prettyAction}`)
      .setColor(0x8ecae6)
      .addFields(
        { name: "Message Author", value: `${userTag} (${userId})` },
        { name: "Moderator", value: moderatorTag },
        { name: "Reason ", value: reason || "No reason provided" },
        { name: "Action ID", value: actionId },
        { name: "Pined Channel", value: `${channelTag} (${channelId})` }
      )
      .setTimestamp();
  } else if (action === "unpin-message") {
    embed = new EmbedBuilder()
      .setTitle(`🔨 ${prettyAction}`)
      .setColor(0x8ecae6)
      .addFields(
        { name: "Message Author", value: `${userTag} (${userId})` },
        { name: "Moderator", value: moderatorTag },
        { name: "Reason ", value: reason || "No reason provided" },
        { name: "Action ID", value: actionId },
        { name: "Unin Channel", value: `${channelTag} (${channelId})` }
      )
      .setTimestamp();
  } else if (action === "timeout") {
    embed = new EmbedBuilder()
      .setTitle(`🔨 ${prettyAction}`)
      .setColor(0x8ecae6)
      .addFields(
        { name: "User", value: `${userTag} (${userId})` },
        { name: "Moderator", value: moderatorTag },
        { name: "Reason ", value: reason || "No reason provided" },
        { name: "Action ID", value: actionId },
        { name: "Duration", value: timeourDuration }
      )
      .setTimestamp();
  } else if (action === "untimeout") {
    embed = new EmbedBuilder()
      .setTitle(`🔨 ${prettyAction}`)
      .setColor(0x8ecae6)
      .addFields(
        { name: "User", value: `${userTag} (${userId})` },
        { name: "Moderator", value: moderatorTag },
        { name: "Reason ", value: reason || "No reason provided" },
        { name: "Action ID", value: actionId }
      )
      .setTimestamp();
  } else if (action === "purge") {
    embed = new EmbedBuilder()
      .setTitle(`🔨 ${prettyAction}`)
      .setColor(0x8ecae6)
      .addFields(
        { name: "UserId", value: `${userTag || "N/A"} (${userId || "N/A"})` },
        { name: "Moderator", value: moderatorTag },
        { name: "Reason ", value: reason || "No reason provided" },
        { name: "Action ID", value: actionId },
        { name: "Purge Channel", value: `${channelTag} (${channelId})` },
        {
          name: "Number of purge messages",
          value: String(numberOfPurgeMessages || "N/A"),
        },
        { name: "Purge Filter", value: String(purgeFilter || "N/A") },
        { name: "Purge Keyword", value: String(purgeKeyword || "N/A") },
        { name: "Purge Hours", value: String(purgeHours || "N/A") }
      )
      .setTimestamp();
  } else if (action === "say") {
    embed = new EmbedBuilder()
      .setTitle(`🔨 ${prettyAction}`)
      .setColor(0x8ecae6)
      .addFields(
        { name: "Message Author", value: `${moderatorTag} (${moderatorId})` },
        { name: "Moderator", value: moderatorTag },
        { name: "Reason ", value: reason || "No reason provided" },
        { name: "Action ID", value: actionId },
        { name: "Channel", value: `${channelTag} (${channelId})` },
        { name: "Message Text", value: sayMessage },
        { name: "Embed?", value: sayMsgEmbedBoolean }
      )
      .setTimestamp();
  } else if (action === "setnickname") {
    embed = new EmbedBuilder()
      .setTitle(`🔨 ${prettyAction}`)
      .setColor(0x8ecae6)
      .addFields(
        { name: "User", value: `${userTag || "N/A"} (${userId || "N/A"})` },
        { name: "Moderator", value: String(moderatorTag || "N/A") },
        { name: "Reason ", value: reason || "No reason provided" },
        { name: "Action ID", value: actionId },
        { name: "Old Nickname", value: String(oldNickname || "N/A") },
        { name: "New Nickname", value: String(newNickname || "N/A") }
      )
      .setTimestamp();
  } else if (action === "ban") {
    embed = new EmbedBuilder()
      .setTitle(`🔨 ${prettyAction}`)
      .setColor(0x8ecae6)
      .addFields(
        { name: "User", value: `${userTag || "N/A"} (${userId || "N/A"})` },
        { name: "Moderator", value: `${moderatorTag} (${moderatorId})` },
        { name: "Reason", value: reason || "No reason provided" },
        { name: "Action ID", value: actionId },
        { name: "Appealable", value: banAppealable },
        { name: "Deleted Messages", value: `${deletedMessages}` }
      )
      .setTimestamp();
  } else if (action === "unban") {
    embed = new EmbedBuilder()
      .setTitle(`🔨 ${prettyAction}`)
      .setColor(0x8ecae6)
      .addFields(
        { name: "User", value: `${userTag || "N/A"} (${userId || "N/A"})` },
        { name: "Moderator", value: `${moderatorTag} (${moderatorId})` },
        { name: "Reason", value: reason || "No reason provided" },
        { name: "Action ID", value: actionId }
      )
      .setTimestamp();
  } else {
    embed = new EmbedBuilder()
      .setTitle(`🔨 ${prettyAction}`)
      .setColor(0x8ecae6)
      .addFields(
        { name: "User", value: `${userTag || "N/A"} (${userId || "N/A"})` },
        { name: "Moderator", value: `${moderatorTag} (${moderatorId})` },
        { name: "Reason", value: reason || "No reason provided" },
        { name: "Action ID", value: actionId }
      )
      .setTimestamp();
  }

  try {
    await channel.send({ embeds: [embed] });
  } catch (err) {
    console.error("❌ Failed to send log message:", err);
  }
};
