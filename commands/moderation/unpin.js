const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} = require("discord.js");

const ModLog = require("../../models/modlog.js");
const generateId = require("../../utils/generateId.js");
const logModAction = require("../../utils/logModAction");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("unpin")
    .setDescription("Unpin a message using its message ID.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)

    .addStringOption((opt) =>
      opt
        .setName("message-id")
        .setDescription("The ID of the message to unpin.")
        .setRequired(true)
    )

    .addStringOption((opt) =>
      opt
        .setName("reason")
        .setDescription("Reason for unpinning the message.")
        .setRequired(true)
    ),

  async execute(interaction) {
    const modRoles = process.env.MOD_ROLES.split(",");
    const moderator = interaction.member;

    // Mod-only check
    if (!moderator.roles.cache.some((r) => modRoles.includes(r.id))) {
      return interaction.reply({
        content: "❌ You do not have permission to use /unpin.",
        ephemeral: true,
      });
    }

    const messageId = interaction.options.getString("message-id");
    const reason = interaction.options.getString("reason");

    // Fetch message
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

    // Unpin message
    await msg.unpin().catch(() => {});

    // Log
    const actionId = generateId();
    const logReason = `
Action: Unpin
Message ID: ${msg.id}
Channel: #${msg.channel.name}
Message Author: ${msg.author.tag}
Moderator: ${interaction.user.tag}
Reason: ${reason}
`.trim();

    // await ModLog.create({
    //     userId: msg.author.id,
    //     targetChannel: msg.channel.id,
    //     moderatorId: interaction.user.id,
    //     action: "unpin",
    //     reason: logReason,
    //     actionId,
    //     targetTag: msg.author.tag
    // });

    await logModAction({
      interaction,
      userId: msg.author.id,
      userTag: msg.author.tag,
      moderatorTag: interaction.user.tag,
      moderatorId: interaction.user.id,
      action: `unpin-message`,
      // target: msg.author,
      reason: reason,
      actionId,
      channelTag: msg.channel.name,
      channelId: msg.channel.id,
    });

    // Confirmation embed
    const embed = new EmbedBuilder()
      .setColor("#00ffff")
      .setTitle("📌 Message Unpinned")
      .setDescription(`Unpinned message by **${msg.author.tag}**.`)
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
