const { Task } = require("@ralevel/db");
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { getTaskTeamFromChannel } = require("../../utils/getTaskTeam");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("mytasks")
        .setDescription("View your claimed, finished, and unclaimed tasks"),

    async execute(interaction) {

        await interaction.deferReply({ ephemeral: true });

        // TEAM CHECK
        const team = getTaskTeamFromChannel(interaction.channelId);
        if (!team) return interaction.editReply("❌ Use inside a graphics, dev or writer task channel.");

        const userId = interaction.user.id;

        const tasks = await Task.find({ team });

        const finished = tasks.filter(t => t.finishedBy.includes(userId));

const claimed = tasks.filter(t => 
    t.assignedTo.includes(userId) &&
    !t.finishedBy.includes(userId)
);
        const unclaimed = tasks.filter(t => !t.assignedTo.includes(userId));

        const embed = new EmbedBuilder()
            .setTitle(`📌 Your Tasks (${team} team)`)
            .addFields(
                {
                    name: "🎨 Claimed Tasks",
                    value: claimed.length
                        ? claimed.map(t => `• **${t.taskId}** ${t.title}`).join("\n")
                        : "None"
                },
                {
                    name: "✅ Finished Tasks",
                    value: finished.length
                        ? finished.map(t => `• **${t.taskId}** ${t.title}`).join("\n")
                        : "None"
                },
                {
                    name: "📂 Tasks You Haven't Claimed",
                    value: unclaimed.length
                        ? unclaimed.map(t => `• **${t.taskId}** ${t.title}`).join("\n")
                        : "None"
                }
            )
            .setColor(team === "graphic" ? "Purple" : "Blue");

        return interaction.editReply({ embeds: [embed] });
    }
};