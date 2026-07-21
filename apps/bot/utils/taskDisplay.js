const { Task, TaskDisplay } = require("@ralevel/db");
const { EmbedBuilder } = require("discord.js");

const displayMessageIds = new Map();

function getEmbedTitle(team) {
  if (team === "dev") return "Developer Tasks";
  if (team === "graphic") return "Graphic Designer Tasks";
  return "Writer Tasks";
}

function getEmbedColor(team) {
  if (team === "dev") return "Blue";
  if (team === "graphic") return "Purple";
  return "Green";
}

async function getStoredDisplayMessageId(team, channelId) {
  if (displayMessageIds.has(channelId)) {
    return displayMessageIds.get(channelId);
  }

  const doc = await TaskDisplay.findOne({ team }).lean();
  if (doc?.displayMessageId) {
    displayMessageIds.set(channelId, doc.displayMessageId);
    return doc.displayMessageId;
  }

  return null;
}

async function setStoredDisplayMessageId(team, channelId, messageId) {
  displayMessageIds.set(channelId, messageId);
  await TaskDisplay.findOneAndUpdate(
    { team },
    { channelId, displayMessageId: messageId },
    { upsert: true },
  );
}

async function clearStoredDisplayMessageId(team, channelId) {
  displayMessageIds.delete(channelId);
  await TaskDisplay.updateOne({ team }, { displayMessageId: null });
}

function isTaskDisplayMessage(msg, team, botUserId) {
  const embed = msg.embeds[0];
  return (
    embed &&
    embed.title === getEmbedTitle(team) &&
    msg.author.id === botUserId
  );
}

async function findDisplayMessageByScan(channel, team) {
  const existingMessages = await channel.messages.fetch({ limit: 50 });
  const botUserId = channel.client.user.id;

  for (const [, msg] of existingMessages) {
    if (isTaskDisplayMessage(msg, team, botUserId)) {
      return msg;
    }
  }

  return null;
}

async function resolveDisplayMessage(channel, team) {
  const storedId = await getStoredDisplayMessageId(team, channel.id);

  if (storedId) {
    try {
      const message = await channel.messages.fetch(storedId);
      if (isTaskDisplayMessage(message, team, channel.client.user.id)) {
        return message;
      }
    } catch (error) {
      if (error.code !== 10008) {
        throw error;
      }
    }

    await clearStoredDisplayMessageId(team, channel.id);
  }

  return findDisplayMessageByScan(channel, team);
}

async function updateTaskDisplay(channel, team) {
  try {
    const activeTasks = await Task.find({
      team,
      status: { $in: ["open", "claimed"] },
    }).sort({ createdAt: 1 });

    const table = formatTaskList(activeTasks, team);

    const embed = new EmbedBuilder()
      .setTitle(getEmbedTitle(team))
      .setColor(getEmbedColor(team))
      .setDescription(table)
      .setFooter({ text: `Total: ${activeTasks.length} active tasks` });

    const displayMessage = await resolveDisplayMessage(channel, team);

    if (displayMessage) {
      await displayMessage.edit({ embeds: [embed] });
      await setStoredDisplayMessageId(team, channel.id, displayMessage.id);
      return displayMessage.id;
    }

    const newMessage = await channel.send({ embeds: [embed] });
    await setStoredDisplayMessageId(team, channel.id, newMessage.id);
    return newMessage.id;
  } catch (error) {
    console.error("Error updating task display:", error);
    return null;
  }
}

function formatTaskList(tasks, team) {
  const COL_TASK = 8;
  const COL_TITLE = 30;
  const COL_EXTRA = 20;
  const GAP = 2;

  let header;
  if (team === "graphic") {
    header = `Task ID${" ".repeat(COL_TASK - "Task ID".length)}  Title${" ".repeat(COL_TITLE - "Title".length)}  Deadline    `;
  } else {
    header = `Task ID${" ".repeat(COL_TASK - "Task ID".length)}  Title${" ".repeat(COL_TITLE - "Title".length)}  Status      `;
  }

  const border = "--------------------------------------------------------";
  const rows = [header, border];

  for (const task of tasks) {
    const taskId = task.taskId.padEnd(COL_TASK);
    const title = (task.title || "").substring(0, COL_TITLE).padEnd(COL_TITLE);

    let extraColumn;
    if (team === "graphic") {
      extraColumn = (task.deadline || "None").padEnd(COL_EXTRA);
    } else {
      let statusText = task.status;
      if (statusText === "claimed") statusText = "Claimed";
      if (statusText === "open") statusText = "Open";
      extraColumn = statusText.padEnd(COL_EXTRA);
    }

    rows.push(
      taskId + " ".repeat(GAP) + title + " ".repeat(GAP) + extraColumn,
    );
  }

  return "```txt\n" + rows.join("\n") + "\n```";
}

function resetDisplayMessageCache() {
  displayMessageIds.clear();
}

module.exports = {
  updateTaskDisplay,
  formatTaskList,
  resetDisplayMessageCache,
  getEmbedTitle,
  findDisplayMessageByScan,
};
