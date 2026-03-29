const { SlashCommandBuilder } = require("discord.js");
const Task = require("../../models/task.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("claim")
        .setDescription("Claim a task")
        .addStringOption(o =>
            o.setName("taskid")
             .setDescription("Task ID to claim")
             .setRequired(true)
        ),

    async execute(interaction) {

        await interaction.deferReply({ ephemeral: true });

        const userId = interaction.user.id;

        // TEAM DETECTION
        let team = null;

        if (interaction.channelId === process.env.GRAPHIC_CHANNEL) team = "graphic";
        else if (interaction.channelId === process.env.DEV_CHANNEL) team = "dev";
        else if (interaction.channelId === process.env.WRITER_CHANNEL) team = "writer";
        else return interaction.editReply("❌ This command must be used inside the graphics, dev or writer task channels.");

        const id = interaction.options.getString("taskid");
        const task = await Task.findOne({ taskId: id });

        if (!task)
            return interaction.editReply("❌ Task not found.");

        if (task.team !== team)
            return interaction.editReply("❌ You cannot claim a task from another team.");

        if (task.status === "completed")
            return interaction.editReply("❌ This task is already completed.");

        // ================================
        //     GRAPHIC TEAM BEHAVIOR
        // ================================
        if (team === "graphic" || "writer") {

            // allow multiple claimants
            if (!task.assignedTo.includes(userId)) {
                task.assignedTo.push(userId);
            } else {
                return interaction.editReply(`❌ You already claimed **${task.taskId}**.`);
            }

            if (task.status === "open") task.status = "claimed";

            await task.save();
            return interaction.editReply(`✅ You have successfully claimed **${task.taskId}**.`);
        }

        // ================================
        //        DEV TEAM BEHAVIOR
        // ================================
        if (team === "dev") {

            // If nobody has claimed yet → assign
            if (task.assignedTo.length === 0) {
                task.assignedTo.push(userId);
                task.status = "claimed";

                await task.save();
                return interaction.editReply(`✅ You have claimed **${task.taskId}**.`);
            }

            // If the same user tries to claim again
            if (task.assignedTo.includes(userId)) {
                return interaction.editReply(`❌ You already claimed **${task.taskId}**.`);
            }

            // If someone else has already claimed it
            return interaction.editReply(
                `❌ This task has already been claimed by <@${task.assignedTo[0]}>.`
            );
        }
    }
};