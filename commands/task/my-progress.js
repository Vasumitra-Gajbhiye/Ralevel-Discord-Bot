const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const Task = require("../../models/task.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("my-progress")
    .setDescription("View your task progress and certificate eligibility"),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const userId = interaction.user.id;

    // TEAM DETECTION
    let team = null;
    if (interaction.channelId === process.env.GRAPHIC_CHANNEL) team = "graphic";
    else if (interaction.channelId === process.env.DEV_CHANNEL) team = "dev";
    else if (interaction.channelId === process.env.WRITER_CHANNEL)
      team = "writer";
    else
      return interaction.editReply(
        "❌ Use this in a graphics, dev, or writer task channel.",
      );

    const countQueries = [
      Task.countDocuments({ team }),
      Task.countDocuments({ team, assignedTo: userId }),
      Task.countDocuments({ team, finishedBy: userId }),
    ];

    if (team === "graphic" || team === "writer") {
      countQueries.push(Task.countDocuments({ team, selected: userId }));
    }

    const [totalTasks, claimed, finished, utilised = 0] =
      await Promise.all(countQueries);

    // BUILD PROGRESS BAR (Crash-proofed!)
    // Math.max(0, ...) ensures we never pass a negative number to .repeat()
    const stars = "⭐".repeat(utilised) + "☆".repeat(Math.max(0, 5 - utilised));
    const bar = `${stars} (${utilised}/5)`;

    const embed = new EmbedBuilder()
      .setTitle(`📊 Your Progress (${team} team)`)
      .addFields(
        {
          name: "📝 Total Tasks Given",
          value: String(totalTasks),
          inline: true,
        },
        {
          name: "🎨 Tasks You Claimed",
          value: String(claimed),
          inline: true,
        },
        {
          name: "✅ Tasks You Finished",
          value: String(finished),
          inline: true,
        },
      )
      .setColor(team === "graphic" ? "Purple" : "Blue");

    // GRAPHIC EXCLUSIVE SECTION
    if (team === "graphic") {
      embed.addFields(
        { name: "🏆 Utilised Designs", value: `${utilised}`, inline: true },
        { name: "📜 Certificate Progress", value: bar },
      );
    }

    // WRITER EXCLUSIVE SECTION
    if (team === "writer") {
      embed.addFields(
        { name: "🏆 Utilised Works", value: `${utilised}`, inline: true },
        { name: "📜 Certificate Progress", value: bar },
      );
    }

    return interaction.editReply({ embeds: [embed] });
  },
};
