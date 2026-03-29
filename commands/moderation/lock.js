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
    .setName("lock")
    .setDescription("Lock a channel to prevent members from sending messages.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)

    .addChannelOption((opt) =>
      opt.setName("channel").setDescription("Channel to lock").setRequired(true)
    )

    .addStringOption((opt) =>
      opt
        .setName("reason")
        .setDescription("Reason for locking the channel.")
        .setRequired(true)
    ),

  async execute(interaction) {
    const channel = interaction.options.getChannel("channel");
    const reason = interaction.options.getString("reason");

    // Apply permission overwrite
    await channel.permissionOverwrites.edit(channel.guild.roles.everyone, {
      SendMessages: false,
    });

    const actionId = generateId();

    // Modlog entry
    const logReason = `
Action: Channel Lock
Channel: #${channel.name}
Moderator: ${interaction.user.tag}
Reason: ${reason}
`.trim();

    // await ModLog.create({
    //     userId: "N/A",
    //     targetChannel: channel.id,
    //     moderatorId: interaction.user.id,
    //     action: "lock",
    //     reason: logReason,
    //     actionId,
    //     targetTag: "Everyone"
    // });

    await logModAction({
      interaction,
      userTag: "Everyone",
      moderatorTag: interaction.user.tag,
      moderatorId: interaction.user.id,
      action: `lock-channel`,
      channelTag: channel.name,
      channelId: channel.id,
      reason: reason,
      actionId,
      // targetChannel: channel.id,
    });

    // Confirmation embed
    const embed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle("🔒 Channel Locked")
      .addFields(
        { name: "Channel", value: `<#${channel.id}>`, inline: true },
        { name: "Moderator", value: interaction.user.tag, inline: true },
        { name: "Reason", value: reason },
        { name: "Log ID", value: `\`${actionId}\`` }
      )
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  },
};
