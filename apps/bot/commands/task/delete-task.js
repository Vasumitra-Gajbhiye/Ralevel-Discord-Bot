const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { Task } = require("@ralevel/db");
const { getTaskTeamFromChannel } = require("../../utils/getTaskTeam");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("delete-task")
    .setDescription("Delete an existing task (mods only)")
    .addStringOption((o) =>
      o.setName("taskid").setDescription("Task ID to delete").setRequired(true),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.PinMessages),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const team = getTaskTeamFromChannel(interaction.channelId);
    if (!team)
      return interaction.editReply("❌ Use this command in a task channel.");

    const taskId = interaction.options.getString("taskid");
    const task = await Task.findOne({ taskId });

    if (!task) return interaction.editReply("❌ Task not found.");

    if (task.team !== team)
      return interaction.editReply(
        "❌ This task does not belong to this team.",
      );

    await Task.deleteOne({ taskId });

    return interaction.editReply(`✅ Task **${taskId}** deleted.`);
  },
};
