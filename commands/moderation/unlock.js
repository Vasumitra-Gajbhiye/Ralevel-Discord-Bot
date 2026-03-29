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
    .setName("unlock")
    .setDescription("Unlock a channel so members can send messages again.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)

    .addChannelOption((opt) =>
      opt
        .setName("channel")
        .setDescription("Channel to unlock")
        .setRequired(true)
    )

    .addStringOption((opt) =>
      opt
        .setName("reason")
        .setDescription("Reason for unlocking the channel.")
        .setRequired(true)
    ),

  async execute(interaction) {
    const channel = interaction.options.getChannel("channel");
    const reason = interaction.options.getString("reason");

    // Restore permissions
    await channel.permissionOverwrites.edit(
      channel.guild.roles.everyone,
      { SendMessages: null } // removes overwrite
    );

    const actionId = generateId();

    // Modlog entry
    const logReason = `
Action: Channel Unlock
Channel: #${channel.name}
Moderator: ${interaction.user.tag}
Reason: ${reason}
`.trim();

    // await ModLog.create({
    //   userId: "N/A",
    //   targetChannel: channel.id,
    //   moderatorId: interaction.user.id,
    //   action: "unlock",
    //   reason: logReason,
    //   actionId,
    //   targetTag: "Everyone",
    // });

    await logModAction({
      interaction,
      moderatorTag: interaction.user.tag,
      moderatorId: interaction.user.id,
      action: "unlock-channel",
      reason,
      actionId,
      channelTag: channel.name,
      channelId: channel.id,
    });

    // Confirmation embed
    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle("🔓 Channel Unlocked")
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
