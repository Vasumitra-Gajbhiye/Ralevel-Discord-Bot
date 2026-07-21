const { Task: Task2 } = require("@ralevel/db");
const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} = require("discord.js");
const { getNextSequenceId } = require("../../utils/getNextSequenceId");
const { getTaskTeamFromChannel } = require("../../utils/getTaskTeam");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("add-task")
    .setDescription("Create a new task")
    .addStringOption((o) =>
      o.setName("title").setDescription("Title of the task").setRequired(true),
    )
    .addStringOption((o) =>
      o
        .setName("description")
        .setDescription("Describe the task")
        .setRequired(true),
    )
    // OPTIONAL FIELDS
    .addStringOption((o) =>
      o
        .setName("resolution")
        .setDescription("Resolution (graphics only)")
        .setRequired(false),
    )
    .addStringOption((o) =>
      o
        .setName("fileformat")
        .setDescription("File format (graphics only)")
        .setRequired(false),
    )
    .addStringOption((o) =>
      o
        .setName("notes")
        .setDescription("Extra notes (graphics only)")
        .setRequired(false),
    )
    .addStringOption((o) =>
      o
        .setName("deadline")
        .setDescription("Deadline for this task")
        .setRequired(false),
    )
    .addStringOption((o) =>
      o
        .setName("word_limit")
        .setDescription("Word Limit for this task")
        .setRequired(false),
    )
    .addStringOption((o) =>
      o
        .setName("file_name_format")
        .setDescription(
          "How should designers name their final file? (graphics only)",
        )
        .setRequired(false),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.PinMessages),

  async execute(interaction) {
    const title = interaction.options.getString("title");
    const description = interaction.options.getString("description");

    // NEW OPTIONAL FIELDS
    const resolution = interaction.options.getString("resolution");
    const fileFormat = interaction.options.getString("fileformat");
    const notes = interaction.options.getString("notes");
    const deadline = interaction.options.getString("deadline");
    const fileNameFormat = interaction.options.getString("file_name_format");
    const wordLimit = interaction.options.getString("word_limit");

    // TEAM DETECTION BASED ON CHANNEL
    const team = getTaskTeamFromChannel(interaction.channelId);
    if (!team) {
      return interaction.reply({
        content: "❌ Use this in a graphic, dev or writer task channel.",
        ephemeral: true,
      });
    }

    const next = await getNextSequenceId("taskId");
    const taskId = `tsk-${String(next).padStart(3, "0")}`;

    // CREATE TASK
    await Task2.create({
      taskId,
      title,
      description,
      team,
      createdBy: interaction.user.id,

      // GRAPHIC EXTRA FIELDS
      resolution: team === "graphic" ? resolution : null,
      fileFormat: team === "graphic" ? fileFormat : null,
      notes: team === "graphic" ? notes : null,
      fileNameFormat: team === "graphic" ? fileNameFormat : null,

      wordLimit: team === "writer" ? wordLimit : null,

      // BOTH TEAMS
      deadline: deadline || null,
    });

    const fields = [
      { name: "Task ID", value: taskId },
      { name: "Description", value: description },
      { name: "Team", value: team },
      { name: "Deadline", value: deadline || "None" },
    ];
    // GRAPHIC-ONLY FIELDS
    if (team === "graphic") {
      if (resolution) fields.push({ name: "Resolution", value: resolution });
      if (fileFormat) fields.push({ name: "File Format", value: fileFormat });
      if (notes) fields.push({ name: "Notes", value: notes });
    }

    // WRITER-ONLY FIELDS
    if (team === "writer") {
      if (wordLimit) fields.push({ name: "Word Limit", value: wordLimit });
    }

    const embed = new EmbedBuilder()
      .setTitle(`📌 Task Details: ${title}`)
      .addFields(...fields)
      .setColor(team === "graphic" ? "Purple" : "Blue");

    return interaction.reply({ embeds: [embed] });
  },
};
