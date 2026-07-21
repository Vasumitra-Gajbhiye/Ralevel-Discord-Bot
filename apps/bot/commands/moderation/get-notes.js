const { Note } = require("@ralevel/db");
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

const MAX_EMBED_FIELDS = 25;

module.exports = {
  data: new SlashCommandBuilder()
    .setName("get-notes")
    .setDescription("View staff notes for a user.")
    .addUserOption((opt) =>
      opt
        .setName("user")
        .setDescription("User to view notes for")
        .setRequired(true),
    ),

  async execute(interaction) {
    const user = interaction.options.getUser("user");

    const notes = await Note.find({ userId: user.id }).sort({
      timestamp: -1,
    });

    if (notes.length === 0) {
      return interaction.reply({
        content: `No notes found for **${user.tag}**.`,
        ephemeral: true,
      });
    }

    const embed = new EmbedBuilder()
      .setTitle(`Notes for ${user.tag}`)
      .setColor(0x5865f2);

    const visibleNotes = notes.slice(0, MAX_EMBED_FIELDS);

    for (const entry of visibleNotes) {
      let authorName = "Unknown";
      try {
        const author = await interaction.client.users.fetch(entry.authorId);
        authorName = author?.tag || entry.authorId;
      } catch {
        authorName = entry.authorId;
      }

      embed.addFields({
        name: `Note — ${entry.actionId}`,
        value:
          `**Author:** ${authorName}\n` +
          `**Note:** ${entry.content}\n` +
          `**Date:** <t:${Math.floor(entry.timestamp / 1000)}:F>`,
        inline: false,
      });
    }

    if (notes.length > MAX_EMBED_FIELDS) {
      embed.setFooter({
        text: `Showing ${MAX_EMBED_FIELDS} of ${notes.length} notes.`,
      });
    }

    return interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
