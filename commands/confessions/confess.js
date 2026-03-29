const { SlashCommandBuilder } = require("discord.js");
const Confession = require("../../models/confession");
const ConfessionBan = require("../../models/confessionBan");

async function getNextConfessionId() {
  const last = await Confession
    .findOne({})
    .sort({ confessionId: -1 })
    .select("confessionId")
    .lean();

  return last ? last.confessionId + 1 : 1;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("confess")
    .setDescription("Submit an anonymous confession")

    .addStringOption(opt =>
      opt
        .setName("confession")
        .setDescription("Your confession")
        .setRequired(true)
        .setMaxLength(2000)
    )

    .addAttachmentOption(opt =>
      opt
        .setName("attachment")
        .setDescription("Optional attachment")
        .setRequired(false)
    )

    .addBooleanOption(opt =>
      opt
        .setName("allow_reply")
        .setDescription("Allow others to reply")
        .setRequired(false)
    ),

  async execute(interaction) {
    // Ban check
    const banned = await ConfessionBan.findOne({
      userId: interaction.user.id,
    });

    if (banned) {
      return interaction.reply({
        content: "🚫 You are banned from submitting confessions.",
        ephemeral: true,
      });
    }

    const content = interaction.options.getString("confession");
    const attachment = interaction.options.getAttachment("attachment");
    const allowReply =
      interaction.options.getBoolean("allow_reply") ?? true;

    const confessionId = await getNextConfessionId();

    await Confession.create({
      confessionId,
      content,
      authorId: interaction.user.id,
      allowReply,
      attachment: attachment?.url ?? null,
    });

    const modChannel =
      await interaction.client.channels.fetch(
        process.env.MOD_ACTION_CHANNEL
      );

    const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } =
      require("discord.js");

    const embed = new EmbedBuilder()
      .setTitle(`Anonymous Confession (#${confessionId})`)
      .setDescription(content)
      .setColor("#f1c40f")
      .setFooter({
        text: `Replies allowed: ${allowReply ? "Yes" : "No"}`,
      });

    if (attachment) {
      embed.setImage(attachment.url);
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`confess_approve:${confessionId}`)
        .setLabel("Approve")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`confess_reject:${confessionId}`)
        .setLabel("Reject")
        .setStyle(ButtonStyle.Danger)
    );

    await modChannel.send({
      embeds: [embed],
      components: [row],
    });

    await interaction.reply({
      content:
        "📨 Your confession has been submitted for review.",
      ephemeral: true,
    });
  },
};