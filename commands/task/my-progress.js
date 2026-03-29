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
        else if (interaction.channelId === process.env.WRITER_CHANNEL) team = "writer";
        else return interaction.editReply("❌ Use this in a graphics or dev task channel.");

        // GET ALL TEAM TASKS
        const tasks = await Task.find({ team });

        const totalTasks = tasks.length;

        const claimed = tasks.filter(t => t.assignedTo.includes(userId));
        const finished = tasks.filter(t => t.finishedBy.includes(userId));

        // GRAPHIC ONLY: count utilised designs
        let utilised = 0;
        if (team === "graphic") {
            utilised = tasks.filter(t => t.selected === userId).length;
        }
         if (team === "writer") {
            utilised = tasks.filter(t => t.selected === userId).length;
        }

        // BUILD PROGRESS BAR (GRAPHIC ONLY)
        const stars = "⭐".repeat(utilised) + "☆".repeat(5 - utilised);
        const bar = `${stars} (${utilised}/5)`;

        const embed = new EmbedBuilder()
            .setTitle(`📊 Your Progress (${team} team)`)
            .addFields(
                { name: "📝 Total Tasks Given", value: String(totalTasks), inline: true },
                { name: "🎨 Tasks You Claimed", value: String(claimed.length), inline: true },
                { name: "✅ Tasks You Finished", value: String(finished.length), inline: true },
            )
            .setColor(team === "graphic" ? "Purple" : "Blue");

        // GRAPHIC EXCLUSIVE SECTION
        if (team === "graphic") {
            embed.addFields(
                { name: "🏆 Utilised Designs", value: `${utilised}`, inline: true },
                { name: "📜 Certificate Progress", value: bar }
            );
        }

        if (team === "writer") {
            embed.addFields(
                { name: "🏆 Utilised Works", value: `${utilised}`, inline: true },
                { name: "📜 Certificate Progress", value: bar }
            );
        }

        return interaction.editReply({ embeds: [embed] });
    }
};