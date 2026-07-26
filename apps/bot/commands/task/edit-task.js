const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { Task } = require("@ralevel/db");
const { getTaskTeamFromChannel } = require("../../utils/getTaskTeam");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("edit-task")
    .setDescription("Edit an existing task (mods only)")
    .addStringOption((o) =>
      o.setName("taskid").setDescription("Task ID to edit").setRequired(true),
    )
    .addStringOption((o) => o.setName("title").setDescription("New task title"))
    .addStringOption((o) =>
      o.setName("description").setDescription("New task description"),
    )
    .addStringOption((o) =>
      o.setName("deadline").setDescription("New deadline"),
    )
    .addStringOption((o) =>
      o.setName("resolution").setDescription("Resolution (graphics only)"),
    )
    .addStringOption((o) =>
      o.setName("fileformat").setDescription("File format (graphics only)"),
    )
    .addStringOption((o) =>
      o
        .setName("filenameformat")
        .setDescription("Required file naming format (graphics only)"),
    )
    .addStringOption((o) =>
      o.setName("notes").setDescription("Extra notes (graphics only)"),
    )
    .addStringOption((o) =>
      o
        .setName("status")
        .setDescription("Task status")
        .addChoices(
          { name: "Open", value: "open" },
          { name: "Claimed", value: "claimed" },
          { name: "Completed", value: "completed" },
        ),
    )
    .addUserOption((o) =>
      o
        .setName("selected")
        .setDescription("Add a winning submission (graphic/writer tasks)"),
    )
    .addUserOption((o) =>
      o
        .setName("remove_selected")
        .setDescription("Remove a winning submission (graphic/writer tasks)"),
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

    const updates = [];

    const setIf = (field, value) => {
      if (value !== null && value !== undefined) {
        task[field] = value;
        updates.push(field);
      }
    };

    setIf("title", interaction.options.getString("title"));
    setIf("description", interaction.options.getString("description"));
    setIf("deadline", interaction.options.getString("deadline"));
    setIf("status", interaction.options.getString("status"));

    if (task.team === "graphic") {
      setIf("resolution", interaction.options.getString("resolution"));
      setIf("fileFormat", interaction.options.getString("fileformat"));
      setIf("fileNameFormat", interaction.options.getString("filenameformat"));
      setIf("notes", interaction.options.getString("notes"));
    }

    if (task.team === "graphic" || task.team === "writer") {
      const addWinner = interaction.options.getUser("selected");
      const removeWinner = interaction.options.getUser("remove_selected");

      if (addWinner) {
        if (!task.finishedBy.includes(addWinner.id)) {
          return interaction.editReply(
            `❌ <@${addWinner.id}> has not submitted finished work for **${task.taskId}**.`,
          );
        }

        if (!task.selected.includes(addWinner.id)) {
          task.selected.push(addWinner.id);
          updates.push("selected");
        }
      }

      if (removeWinner) {
        const before = task.selected.length;
        task.selected = task.selected.filter((id) => id !== removeWinner.id);
        if (task.selected.length !== before) {
          updates.push("selected");
        }
      }
    }

    if (!updates.length)
      return interaction.editReply("⚠️ No changes were provided.");

    await task.save();

    return interaction.editReply(
      `✅ Task **${task.taskId}** updated successfully.\n` +
        `Updated fields: ${updates.join(", ")}`,
    );
  },
};
