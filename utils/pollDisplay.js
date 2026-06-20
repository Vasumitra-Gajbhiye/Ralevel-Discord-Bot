const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

const MAX_BUTTONS = 25;

function getVoteCounts(poll) {
  const counts = {};
  for (const option of poll.options) {
    counts[option.id] = 0;
  }

  for (const vote of poll.votes) {
    for (const optionId of vote.optionIds) {
      if (counts[optionId] !== undefined) {
        counts[optionId]++;
      }
    }
  }

  return counts;
}

function getTotalVoters(poll) {
  return poll.votes.filter((v) => v.optionIds.length > 0).length;
}

function formatDeadline(deadline) {
  if (!deadline) return "None";
  return `<t:${Math.floor(new Date(deadline).getTime() / 1000)}:F> (<t:${Math.floor(new Date(deadline).getTime() / 1000)}:R>)`;
}

function formatChoiceType(choiceType) {
  return choiceType === "single" ? "Single choice" : "Multiple choice";
}

function formatResultsLines(poll) {
  const counts = getVoteCounts(poll);
  const totalVotes = Object.values(counts).reduce((sum, n) => sum + n, 0);
  const maxCount = Math.max(...Object.values(counts), 1);

  return poll.options.map((option) => {
    const count = counts[option.id] || 0;
    const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
    const barLen = Math.round((count / maxCount) * 10);
    const bar = "█".repeat(barLen) + "░".repeat(10 - barLen);
    return `**${option.label}**\n${bar} ${count} vote${count === 1 ? "" : "s"} (${pct}%)`;
  });
}

function buildPollEmbed(poll, guild) {
  const roleMentions = poll.allowedRoleIds
    .map((id) => {
      const role = guild?.roles?.cache?.get(id);
      return role ? `<@&${id}>` : `\`${id}\``;
    })
    .join(", ");

  const embed = new EmbedBuilder()
    .setTitle(`📊 ${poll.question}`)
    .setColor(0x5865f2)
    .addFields(
      {
        name: "Choice type",
        value: formatChoiceType(poll.choiceType),
        inline: true,
      },
      {
        name: "Deadline",
        value: formatDeadline(poll.deadline),
        inline: true,
      },
      {
        name: "Eligible voters",
        value: roleMentions || "None",
      },
      {
        name: "Options",
        value: poll.options.map((o, i) => `${i + 1}. ${o.label}`).join("\n"),
      },
    )
    .setFooter({ text: `Poll ID: ${poll.pollId} • ${getTotalVoters(poll)} voter(s)` })
    .setTimestamp(poll.createdAt || undefined);

  return embed;
}

function buildResultsEmbed(poll, closed = false) {
  const lines = formatResultsLines(poll);
  const embed = new EmbedBuilder()
    .setTitle(closed ? `📊 Poll closed — ${poll.question}` : `📊 Results — ${poll.question}`)
    .setColor(closed ? 0xed4245 : 0x57f287)
    .setDescription(lines.join("\n\n"))
    .setFooter({
      text: `Poll ID: ${poll.pollId} • ${getTotalVoters(poll)} voter(s)${closed ? " • Voting closed" : ""}`,
    })
    .setTimestamp();

  if (poll.deadline && closed) {
    embed.addFields({
      name: "Deadline",
      value: formatDeadline(poll.deadline),
    });
  }

  return embed;
}

function buildBreakdownEmbed(poll) {
  const counts = getVoteCounts(poll);
  const fields = poll.options.map((option) => {
    const voters = poll.votes
      .filter((v) => v.optionIds.includes(option.id))
      .map((v) => `<@${v.userId}>`);

    return {
      name: `${option.label} (${counts[option.id] || 0})`,
      value: voters.length > 0 ? voters.join(", ") : "No votes",
    };
  });

  const noVoteUsers = poll.votes.filter((v) => v.optionIds.length === 0);
  if (noVoteUsers.length > 0) {
    fields.push({
      name: "Cleared votes",
      value: noVoteUsers.map((v) => `<@${v.userId}>`).join(", "),
    });
  }

  return new EmbedBuilder()
    .setTitle(`📋 Breakdown — ${poll.question}`)
    .setColor(0xfee75c)
    .addFields(fields)
    .setFooter({ text: `Poll ID: ${poll.pollId} • Staff view only` })
    .setTimestamp();
}

function buildPollButtons(poll, disabled = false) {
  const rows = [];
  let currentRow = new ActionRowBuilder();
  let buttonsInRow = 0;

  for (const option of poll.options) {
    if (rows.length * 5 + buttonsInRow >= MAX_BUTTONS - 1) break;

    if (buttonsInRow >= 5) {
      rows.push(currentRow);
      currentRow = new ActionRowBuilder();
      buttonsInRow = 0;
    }

    const label =
      option.label.length > 80 ? `${option.label.slice(0, 77)}...` : option.label;

    currentRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`poll_vote:${poll.pollId}:${option.id}`)
        .setLabel(label)
        .setStyle(ButtonStyle.Primary)
        .setDisabled(disabled),
    );
    buttonsInRow++;
  }

  if (buttonsInRow > 0) {
    rows.push(currentRow);
  }

  const resultsRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`poll_results:${poll.pollId}`)
      .setLabel("View Results")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
  );
  rows.push(resultsRow);

  return rows;
}

function buildRolePingContent(roleIds) {
  return roleIds.map((id) => `<@&${id}>`).join(" ");
}

module.exports = {
  getVoteCounts,
  getTotalVoters,
  buildPollEmbed,
  buildResultsEmbed,
  buildBreakdownEmbed,
  buildPollButtons,
  buildRolePingContent,
};
