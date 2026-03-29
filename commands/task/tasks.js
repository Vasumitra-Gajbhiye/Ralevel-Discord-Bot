const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const Task = require("../../models/task.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("tasks")
        .setDescription("View available tasks or see details for a specific task")
        .addStringOption(o =>
            o.setName("taskid")
             .setDescription("Optional task ID to view details")
             .setRequired(false)
        ),

    async execute(interaction) {

        // TEAM DETECTION BASED ON CHANNEL
        let team = null;

        if (interaction.channelId === process.env.GRAPHIC_CHANNEL) {
            team = "graphic";
        } else if (interaction.channelId === process.env.DEV_CHANNEL) {
            team = "dev";
        } else if (interaction.channelId === process.env.WRITER_CHANNEL) {
            team = "writer";
        }  
        else {
            return interaction.reply({
                content: "❌ This command must be used inside the graphics, dev or writer task channels.",
                ephemeral: true
            });
        }

        const id = interaction.options.getString("taskid");

        // --- IF SPECIFIC TASK ID IS PROVIDED ---
        if (id) {
            const task = await Task.findOne({ taskId: id });

            if (!task)
                return interaction.reply({ content: "❌ Task not found.", ephemeral: true });

            // Prevent seeing tasks from another team
            if (task.team !== team)
                return interaction.reply({
                    content: "❌ This task does not belong to this team.",
                    ephemeral: true
                });

                const fields = [
                        { name: "Task ID", value: task.taskId },
                        { name: "Description", value: task.description },
                        { name: "Team", value: task.team },
                        { name: "Status", value: task.status },

                        { name: "Deadline", value: task.deadline || "None" },
                        { 
                            name: "Claimed By",
                        value: task.assignedTo.length
                            ? task.assignedTo.map(id => `<@${id}>`).join(", ")
                            : "Nobody has claimed this task yet."
                        },
                        {
                            name: "Finished By",
                            value: task.finishedBy.length
                                ? task.finishedBy.map((id, index) => {

                                    // GRAPHIC TEAM → show username + link
                                    if (task.team === "graphic" || "writer") {
                                        const link = task.finishedLinks[index] || "No link provided";
                                        return `• <@${id}> — ${link}`;
                                    }

                                    // DEV TEAM → show only the username (no link)
                                    return `• <@${id}>`;

                                }).join("\n")
                                : "Nobody has finished this task yet."
                        }
                ];

                if (task.selected) {
    fields.push({
        name: "Selected",
        value: `<@${task.selected}>`
    });
}
// GRAPHIC-ONLY FIELDS
if (task.team === "graphic") {
    if (task.fileNameFormat) fields.push({ name: "File Naming Format", value: task.fileNameFormat });
    if (task.resolution) fields.push({ name: "Resolution", value: task.resolution });
    if (task.fileFormat) fields.push({ name: "File Format", value: task.fileFormat });
    if (task.notes) fields.push({ name: "Notes", value: task.notes });
    
}

// WRITER-ONLY FIELDS
if (team === "writer") {
    if (task.wordLimit) fields.push({ name: "Word Limit", value: task.wordLimit });

}


            const embed = new EmbedBuilder()
                .setTitle(`📌 Task Details: ${task.title}`)
                .addFields(...fields)
                .setColor(task.team === "graphic" ? "Purple" : "Blue");

return interaction.reply({ embeds: [embed], ephemeral: true });        }

        // --- NO TASK ID → LIST ALL OPEN TASKS FOR THIS TEAM ---
        const tasks = await Task.find({ team, status: { $ne: "completed" } });

        if (!tasks.length) {
            return interaction.reply({
                content: "🎉 No open tasks available for this team!",
                ephemeral: true
            });
        }

        let embedTitle;
        if(team ==="graphic") embedTitle = "🎨 Open Graphic Tasks"
        if(team ==="dev") embedTitle = "💻 Open Dev Tasks"
        if(team ==="writer") embedTitle = "🖋️ Open Writer Tasks"



        const embed = new EmbedBuilder()
            .setTitle(embedTitle)
            .setDescription(tasks.map(t => `**${t.taskId}** — ${t.title}`).join("\n"))
            .setColor(team === "graphic" ? "Purple" : "Blue");

        return interaction.reply({ embeds: [embed], ephemeral: true });
    }
};