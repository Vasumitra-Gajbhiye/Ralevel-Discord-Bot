const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} = require("discord.js");
const ModLog = require("../../models/modlog.js");
const generateActionId = require("../../utils/generateId.js");
const logModAction = require("../../utils/logModAction.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("slowmode")
    .setDescription("Set slowmode in a channel")
    .addChannelOption((opt) =>
      opt
        .setName("channel")
        .setDescription("Channel to modify")
        .setRequired(true)
    )
    .addIntegerOption((opt) =>
      opt
        .setName("seconds")
        .setDescription("Slowmode duration in seconds (0 = off)")
        .setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName("reason")
        .setDescription("Reason for slowmode change")
        .setRequired(true)
    ),

  async execute(interaction) {
    const modRoles = process.env.MOD_ROLES.split(",");
    if (!interaction.member.roles.cache.some((r) => modRoles.includes(r.id))) {
      return interaction.reply({
        content: "❌ You are not allowed to use this command.",
        flags: 64,
      });
    }

    const channel = interaction.options.getChannel("channel");
    const seconds = interaction.options.getInteger("seconds");
    const reason = interaction.options.getString("reason");

    try {
      // Apply slowmode
      await channel.setRateLimitPerUser(seconds, reason);
    } catch (err) {
      console.error(err);
      return interaction.reply({
        content: "❌ Failed to update slowmode. Check my permissions.",
        flags: 64,
      });
    }

    // Create log entry
    const actionId = generateActionId();

    // DO NOT REMOVE ANY MODLOG.CREATE COMMENTS IN ANY FILE

    // await ModLog.create({
    //   userId: interaction.user.id, // moderator as target
    //   moderatorId: interaction.user.id,
    //   targetChannel: channel.id,
    //   targetTag: `#${channel.name}`,
    //   action: "slowmode",
    //   reason,
    //   actionId,
    // });

    await logModAction({
      interaction,
      moderatorTag: interaction.user.tag,
      moderatorId: interaction.user.id,
      slowModeDuration: seconds,
      action: "slowmode",
      // target: interaction.user,
      reason,
      actionId,
      channelTag: channel.name,
      channelId: channel.id,
      // extra: {
      //   targetChannel: channel,
      //   targetTag: `#${channel.name}`,
      // },
    });

    const embed = new EmbedBuilder()
      .setTitle("⏱ Slowmode Updated")
      .setColor("Blue")
      .setDescription(
        `**Channel:** <#${channel.id}>\n` +
          `**Slowmode:** ${seconds}s\n` +
          `**Reason:** ${reason}`
      )
      .setFooter({ text: `Action ID: ${actionId}` });

    return interaction.reply({ embeds: [embed] });
  },
};
