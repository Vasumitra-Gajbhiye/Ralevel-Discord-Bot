// commands/helper/helper.js

const {
  SlashCommandBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  EmbedBuilder,
} = require("discord.js");

const HelperRole = require("../../models/helperRole.js");

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

    // Cancel request button
    const cancelBtn = new ButtonBuilder()
      .setCustomId("cancel_request")
      .setLabel("Cancel Request")
      .setStyle(ButtonStyle.Danger);

    const row = new ActionRowBuilder().addComponents(cancelBtn);

    // Time: 10 minutes from now, displayed as relative time
    const triggerTime = Math.floor(Date.now() / 1000) + 10;
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
      // Wait up to 10 minutes for cancel button press
      const button = await msg.awaitMessageComponent({
        filter: (i) => i.user.id === interaction.user.id,
        time: 10_000,
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
