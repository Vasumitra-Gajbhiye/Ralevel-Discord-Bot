const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const crypto = require("crypto");
const Note = require("../../models/note");
const logModAction = require("../../utils/logModAction");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("note")
    .setDescription("Add a staff note about a user.")
    .addUserOption((opt) =>
      opt.setName("user").setDescription("User to note").setRequired(true),
    )
    .addStringOption((opt) =>
      opt
        .setName("note")
        .setDescription("Note content")
        .setRequired(true)
        .setMaxLength(1000),
    ),

  async execute(interaction) {
    const user = interaction.options.getUser("user");
    const content = interaction.options.getString("note");
    const actionId = crypto.randomUUID();

    await Note.create({
      userId: user.id,
      userTag: user.tag,
      authorId: interaction.user.id,
      content,
      actionId,
    });

    await logModAction({
      interaction,
      userId: user.id,
      userTag: user.tag,
      targetTag: user.tag,
      moderatorTag: interaction.user.tag,
      moderatorId: interaction.user.id,
      action: "note",
      reason: content,
      actionId,
    });

    const embed = new EmbedBuilder()
      .setTitle("Note Added")
      .setColor(0x5865f2)
      .addFields(
        { name: "User", value: `<@${user.id}>`, inline: true },
        { name: "Note", value: content, inline: false },
        { name: "Action ID", value: actionId, inline: false },
      )
      .setTimestamp();

    return interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
