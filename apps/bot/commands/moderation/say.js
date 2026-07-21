const { ModLog } = require("@ralevel/db");
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} = require("discord.js");

const generateId = require("../../utils/generateId.js");
const logModAction = require("../../utils/logModAction.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("say")
    .setDescription("Make the bot send a message as an announcement.")
    .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages)

    // REQUIRED OPTIONS FIRST
    .addChannelOption((opt) =>
      opt
        .setName("channel")
        .setDescription("Channel where the bot will send the message.")
        .setRequired(true),
    )

    .addStringOption((opt) =>
      opt
        .setName("message")
        .setDescription("Message you want the bot to say.")
        .setRequired(true),
    )

    .addStringOption((opt) =>
      opt
        .setName("reason")
        .setDescription("Reason for sending this announcement.")
        .setRequired(true),
    )

    // OPTIONAL OPTIONS AFTER
    .addBooleanOption((opt) =>
      opt.setName("embed").setDescription("Send the message as an embed?"),
    ),

  async execute(interaction) {
    const channel = interaction.options.getChannel("channel");
    const messageText = interaction.options.getString("message");
    const embedMode = interaction.options.getBoolean("embed");
    const reason = interaction.options.getString("reason");

    // ----- SEND MESSAGE -----
    if (embedMode) {
      const botEmbed = new EmbedBuilder()
        .setColor(0x2b2d31)
        .setDescription(messageText)
        .setTimestamp();

      await channel.send({
        embeds: [botEmbed],
        allowedMentions: { parse: [] },
      });
    } else {
      await channel.send({
        content: messageText,
        allowedMentions: { parse: [] },
      });
    }

    // ----- LOG ENTRY -----
    const actionId = generateId();

    const logReason = `
Action: Say Command
Channel: #${channel.name}
Moderator: ${interaction.user.tag}
Message: ${messageText}
Embed: ${embedMode ? "Yes" : "No"}
Reason: ${reason}
`.trim();

    // DO NOT REMOVE ANY MODLOG.CREATE COMMENTS IN ANY FILE

    // await ModLog.create({
    //     userId: "N/A",
    //     targetChannel: channel.id,
    //     moderatorId: interaction.user.id,
    //     action: "say",
    //     reason: logReason,
    //     actionId,
    //     targetTag: "N/A"
    // });

    await logModAction({
      interaction,
      moderatorTag: interaction.user.tag,
      moderatorId: interaction.user.id,
      action: "say",
      reason: reason,
      actionId,
      channelTag: channel.name,
      channelId: channel.id,
      sayMessage: messageText,
      sayMsgEmbedBoolean: embedMode ? "Yes" : "No",
      // extra: {
      //   targetChannel: channel,
      //   targetTag: member.user.tag,
      // },
    });

    // ----- CONFIRMATION EMBED -----
    const confirm = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("📣 Message Sent")
      .addFields(
        { name: "Channel", value: `<#${channel.id}>`, inline: true },
        { name: "Mode", value: embedMode ? "Embed" : "Normal", inline: true },
        { name: "Moderator", value: interaction.user.tag, inline: true },
        { name: "Reason", value: reason, inline: false },
        { name: "Log ID", value: `\`${actionId}\`` },
      )
      .setTimestamp();

    return interaction.reply({ embeds: [confirm] });
  },
};
