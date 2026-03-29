const { SlashCommandBuilder } = require("discord.js");
const Task = require("../../models/task.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("finished-tsk")
        .setDescription("Mark your claimed task as finished")
        .addStringOption(o =>
            o.setName("taskid")
             .setDescription("Task ID")
             .setRequired(true)
        )
        .addStringOption(o =>
            o.setName("link")
             .setDescription("Link to your finished work (graphics and writers only)")
             .setRequired(false)
        ),

    async execute(interaction) {

        await interaction.deferReply({ ephemeral: true });

        const userId = interaction.user.id;

        // TEAM DETECTION
        let team = null;
        if (interaction.channelId === process.env.GRAPHIC_CHANNEL) team = "graphic";
        else if (interaction.channelId === process.env.DEV_CHANNEL) team = "dev";
        else if (interaction.channelId === process.env.WRITER_CHANNEL) team = "writer";
        else return interaction.editReply("❌ Use this command inside your team task channel.");

        const taskId = interaction.options.getString("taskid");
        const link = interaction.options.getString("link");

        const task = await Task.findOne({ taskId });

        if (!task)
            return interaction.editReply("❌ Task not found.");

        if (task.team !== team)
            return interaction.editReply("❌ This task does not belong to your team.");

        if (!task.assignedTo.includes(userId))
            return interaction.editReply("❌ You cannot finish a task you did not claim.");

        // PREVENT DOUBLE FINISH
        if (task.finishedBy.includes(userId))
            return interaction.editReply("❌ You have already marked this task as finished.");

        // ===========================
        // GRAPHIC TEAM LOGIC (link required)
        // ===========================
        if (team === "graphic" || "writer") {
            if (!link && team === "graphic")
                return interaction.editReply("❌ Graphic designers must provide a Google Drive link to their finished work.");

            if (!link && team === "writer")
                return interaction.editReply("❌ Writers must provide a Google Docs link to their finished work.");


            task.finishedBy.push(userId);
            task.finishedLinks.push(link);

            await task.save();

            return interaction.editReply(
                `🎨 You marked **${taskId}** as finished!\n🔗 Link saved.`
            );
        }

        // ===========================
        // DEV TEAM LOGIC (link optional)
        // ===========================
        task.finishedBy.push(userId);

        // If dev didn't provide a link, store null to maintain indexing
        task.finishedLinks.push(link || null);

        await task.save();

        return interaction.editReply(
            `💻 You marked **${taskId}** as finished!`
            + (link ? "\n🔗 Link saved." : "")
        );
    }
};