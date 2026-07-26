const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { Task } = require("@ralevel/db");
const { getTaskTeamFromChannel } = require("../../utils/getTaskTeam");

const WINNER_OPTION_NAMES = [
  "selected",
  "selected2",
  "selected3",
  "selected4",
  "selected5",
];

function collectWinnerIds(interaction) {
  const ids = [];
  for (const name of WINNER_OPTION_NAMES) {
    const user = interaction.options.getUser(name);
    if (user && !ids.includes(user.id)) {
      ids.push(user.id);
    }
  }
  return ids;
}

function buildCommand() {
  const builder = new SlashCommandBuilder()
    .setName("mark-tsk-done")
    .setDescription(
      "Mark a task as completed and select winning submissions (mods only)",
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.PinMessages)
    .addStringOption((o) =>
      o
        .setName("taskid")
        .setDescription("Task ID to complete")
        .setRequired(true),
    );

  const descriptions = [
    "First winning submission (graphic/writer tasks)",
    "Second winning submission (graphic/writer tasks)",
    "Third winning submission (graphic/writer tasks)",
    "Fourth winning submission (graphic/writer tasks)",
    "Fifth winning submission (graphic/writer tasks)",
  ];

  for (let i = 0; i < WINNER_OPTION_NAMES.length; i++) {
    builder.addUserOption((o) =>
      o
        .setName(WINNER_OPTION_NAMES[i])
        .setDescription(descriptions[i])
        .setRequired(false),
    );
  }

  return builder;
}

module.exports = {
  data: buildCommand(),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const taskId = interaction.options.getString("taskid");
    const winnerIds = collectWinnerIds(interaction);

    const task = await Task.findOne({ taskId });

    if (!task) return interaction.editReply("❌ Task not found.");

    const team = getTaskTeamFromChannel(interaction.channelId);
    if (!team)
      return interaction.editReply("❌ Use this inside a team task channel.");

    if (team === "graphic" || team === "writer") {
      const notFinished = winnerIds.filter(
        (id) => !task.finishedBy.includes(id),
      );
      if (notFinished.length) {
        return interaction.editReply(
          `❌ These winners have not submitted finished work for **${taskId}**: ${notFinished.map((id) => `<@${id}>`).join(", ")}`,
        );
      }
    }

    task.status = "completed";

    if ((team === "graphic" || team === "writer") && winnerIds.length) {
      task.selected = winnerIds;
    }

    await task.save();

    if (team === "graphic" && winnerIds.length) {
      const label =
        winnerIds.length === 1 ? "Selected designer" : "Selected designers";
      return interaction.editReply(
        `✅ **${taskId}** marked as fully completed.\n⭐ ${label}: ${winnerIds.map((id) => `<@${id}>`).join(", ")}`,
      );
    }

    if (team === "writer" && winnerIds.length) {
      const label =
        winnerIds.length === 1 ? "Selected writer" : "Selected writers";
      return interaction.editReply(
        `✅ **${taskId}** marked as fully completed.\n⭐ ${label}: ${winnerIds.map((id) => `<@${id}>`).join(", ")}`,
      );
    }

    return interaction.editReply(`✅ **${taskId}** marked as fully completed.`);
  },
};
