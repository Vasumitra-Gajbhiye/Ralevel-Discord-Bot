const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} = require("discord.js");

const generateId = require("../../utils/generateId.js");
const logModAction = require("../../utils/logModAction");
const resolveTargetMessage = require("../../utils/resolveTargetMessage.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("unpin")
    .setDescription("Unpin a message using its message ID.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)

    .addStringOption((opt) =>
      opt
        .setName("message-link")
        .setDescription(
          "Discord message link or message ID (right-click message → Copy Link).",
        )
        .setRequired(true),
    )

    .addStringOption((opt) =>
      opt
        .setName("reason")
        .setDescription("Reason for unpinning the message.")
        .setRequired(true),
    )

    .addChannelOption((opt) =>
      opt
        .setName("channel")
        .setDescription(
          "Channel containing the message (defaults to current channel).",
        ),
    ),

  async execute(interaction) {
    const rawInput = interaction.options.getString("message-link");
    const reason = interaction.options.getString("reason");

    const resolved = await resolveTargetMessage(interaction, rawInput);
    if (resolved.error) {
      return interaction.reply({
        content: resolved.error,
        ephemeral: true,
      });
    }

    const { msg } = resolved;

    try {
      await msg.unpin();
    } catch (err) {
      return interaction.reply({
        content: `❌ Failed to unpin message: ${err.message}`,
        ephemeral: true,
      });
    }

    const actionId = generateId();

    // DO NOT REMOVE ANY MODLOG.CREATE COMMENTS IN ANY FILE

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

    const embed = new EmbedBuilder()
      .setColor("#00ffff")
      .setTitle("📌 Message Unpinned")
      .setDescription(`Unpinned message by **${msg.author.tag}**.`)
      .addFields(
        { name: "Channel", value: `<#${msg.channel.id}>`, inline: true },
        { name: "Message ID", value: `${msg.id}`, inline: true },
        { name: "Moderator", value: interaction.user.tag, inline: true },
        { name: "Reason", value: reason, inline: false },
        { name: "Log ID", value: `\`${actionId}\`` },
      )
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  },
};
