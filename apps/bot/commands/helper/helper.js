// commands/helper/helper.js
const { HelperRole } = require("@ralevel/db");

const {
  SlashCommandBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  EmbedBuilder,
} = require("discord.js");

const { getGuildConfig } = require("../../utils/guildConfigStore");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("helper")
    .setDescription(
      "Request help from the assigned subject helper in this channel."
    ),

  async execute(interaction) {
    const channelId = interaction.channel.id;

    // Fetch helper role assigned to this channel
    const helperData = await HelperRole.findOne({ channelId });
    if (!helperData) {
      return interaction.reply({
        content:
          "⚠️ This channel does not have a helper role assigned.\nAsk a staff member to run **/sethelper @role** in this channel.",
        ephemeral: true,
      });
    }

    const helperRoleId = helperData.roleId;
    const pingDelayMs = getGuildConfig().helper?.pingDelayMs ?? 10_000;
    const pingDelaySec = Math.max(1, Math.ceil(pingDelayMs / 1000));

    // Cancel request button
    const cancelBtn = new ButtonBuilder()
      .setCustomId("cancel_request")
      .setLabel("Cancel Request")
      .setStyle(ButtonStyle.Danger);

    const row = new ActionRowBuilder().addComponents(cancelBtn);

    const triggerTime = Math.floor(Date.now() / 1000) + pingDelaySec;
    const relativeTime = `<t:${triggerTime}:R>`;

    const embed = new EmbedBuilder()
      .setTitle("⏳ Helper Request Pending")
      .setDescription(
        `A helper will be pinged **${relativeTime}**.\n\n` +
          `If your issue is solved before that, click **Cancel Request** to stop the ping.`
      )
      .setColor("#00AEEF");

    const msg = await interaction.reply({
      embeds: [embed],
      components: [row],
    });

    try {
      const button = await msg.awaitMessageComponent({
        filter: (i) => i.user.id === interaction.user.id,
        time: pingDelayMs,
      });

      if (button.customId === "cancel_request") {
        await button.update({
          content: "✅ Helper request cancelled.",
          embeds: [],
          components: [],
        });
      }
    } catch {
      await interaction.channel.send({
        content: `📩 <@&${helperRoleId}> — help requested by <@${interaction.user.id}>`,
      });

      // Clean chat
      await interaction.deleteReply();
    }
  },
};
