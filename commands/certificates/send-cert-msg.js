const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
require("dotenv").config();

const APPLICATION_CHANNEL = process.env.APPLICATION_CHANNEL;

module.exports = {
  data: new SlashCommandBuilder()
    .setName("send-cert-msg")
    .setDescription("Send the certificate application panel")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const channel = await interaction.client.channels.fetch(
      APPLICATION_CHANNEL
    );

    if (!channel || !channel.isTextBased()) {
      return interaction.reply({
        content: "❌ Application channel not found.",
        ephemeral: true,
      });
    }

    const embed = new EmbedBuilder()
      .setTitle("🧾 Certificate Application")
      .setDescription(
        "**__How to Apply:__**\n" +
          "Click on the relevant application button below.\n\n" +
          "**__Eligibility & Availability:__**\n" +
          "**Helper Certification**\n" +
          "• Achieve the rank of <@&1437727634711777450> by reaching 100 reputation points.\nMaintain this position for a minimum of 1 month.\n\n" +
          "**Writer Certification**\n" +
          "• Submit a minimum of 5 extensive and helpful blogs/pieces-of-writing to our website.\n\n" +
          "**Resource Contributor Certification**\n" +
          "• Based on the work put in to the resources.\n• Final decision is made by the Administrative team after resource submission\n\n" +
          "**Graphic Designer Certification**\n" +
          "• Submit a minimum of 5 pieces of graphic design (must have been utilized) as a <@&1431092954100928583>.\n\n" +
          "**Moderator Certification**\n" +
          "• Eligable moderators will be notified by admins\n\n" +
          "Please ensure you meet the requirements before applying.\n" +
          "Please ensure your DM's are open so that we can send updates"
      )
      .setColor("#2CDAF2")
      .setFooter({
        text: "Only one pending application per certificate is permitted.",
      })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("apply_helper")
        .setLabel("Apply — Helper")
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId("apply_writer")
        .setLabel("Apply — Writer")
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId("apply_resource")
        .setLabel("Apply — Resource")
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId("apply_graphic")
        .setLabel("Apply — Graphic")
        .setStyle(ButtonStyle.Primary)
    );

    await channel.send({
      embeds: [embed],
      components: [row],
    });

    await interaction.reply({
      content: "✅ Certificate application panel sent.",
      ephemeral: true,
    });
  },
};
