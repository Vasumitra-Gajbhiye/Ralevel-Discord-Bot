const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} = require("discord.js");
const logModAction = require("../../utils/logModAction.js");

const ModLog = require("../../models/modlog.js");
const generateId = require("../../utils/generateId.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("pin")
    .setDescription("Pin a message using its message ID.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)

    .addStringOption((opt) =>
      opt
        .setName("message-id")
        .setDescription("The ID of the message to pin.")
        .setRequired(true)
    )

    .addStringOption((opt) =>
      opt
        .setName("reason")
        .setDescription("Reason for pinning the message.")
        .setRequired(true)
    ),

  async execute(interaction) {
    const modRoles = process.env.MOD_ROLES.split(",");
    const moderator = interaction.member;

    // Mod-only check
    if (!moderator.roles.cache.some((r) => modRoles.includes(r.id))) {
      return interaction.reply({
        content: "❌ You do not have permission to use /pin.",
        ephemeral: true,
      });
    }

    const messageId = interaction.options.getString("message-id");
    const reason = interaction.options.getString("reason");

    // Fetch the message from the same channel
    const msg = await interaction.channel.messages
      .fetch(messageId)
      .catch(() => null);

    if (!msg) {
      return interaction.reply({
        content:
          "❌ Message not found in this channel. Make sure the ID is correct.",
        ephemeral: true,
      });
    }

    // Pin message
    await msg.pin().catch(() => {});

    // Logging
    const actionId = generateId();
    const logReason = `
Action: Pin
Message ID: ${msg.id}
Channel: #${msg.channel.name}
Message Author: ${msg.author.tag}
Moderator: ${interaction.user.tag}
Reason: ${reason}
`.trim();

    // await ModLog.create({
    //   userId: msg.author.id,
    //   targetChannel: msg.channel.id,
    //   moderatorId: interaction.user.id,
    //   action: "pin",
    //   reason: logReason,
    //   actionId,
    //   targetTag: msg.author.tag,
    // });

    await logModAction({
      interaction,
      userId: msg.author.id,
      userTag: msg.author.tag,
      moderatorTag: interaction.user.tag,
      moderatorId: interaction.user.id,
      action: `pin-message`,
      // target: msg.author,
      reason: reason,
      actionId,
      channelTag: msg.channel.name,
      channelId: msg.channel.id,
    });

    // Confirmation embed
    const embed = new EmbedBuilder()
      .setColor("#00ffff")
      .setTitle("📌 Message Pinned")
      .setDescription(`Pinned message by **${msg.author.tag}**.`)
      .addFields(
        { name: "Channel", value: `<#${msg.channel.id}>`, inline: true },
        { name: "Message ID", value: `${msg.id}`, inline: true },
        { name: "Moderator", value: interaction.user.tag, inline: true },
        { name: "Reason", value: reason, inline: false },
        { name: "Log ID", value: `\`${actionId}\`` }
      )
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  },
};
