const { Events } = require("discord.js");
const Poll = require("../models/poll");
const {
  buildResultsEmbed,
  buildPollButtons,
} = require("../utils/pollDisplay");

const CHECK_INTERVAL_MS = 60 * 1000;

function isPollExpired(poll) {
  return poll.deadline && new Date(poll.deadline).getTime() <= Date.now();
}

function memberCanVote(member, poll) {
  if (!member) return false;
  return poll.allowedRoleIds.some((roleId) => member.roles.cache.has(roleId));
}

function findOrCreateVote(poll, userId) {
  let vote = poll.votes.find((v) => v.userId === userId);
  if (!vote) {
    vote = { userId, optionIds: [], updatedAt: new Date() };
    poll.votes.push(vote);
  }
  return vote;
}

async function closePoll(client, poll) {
  if (poll.status === "closed") return;

  poll.status = "closed";
  await poll.save();

  try {
    const channel = await client.channels.fetch(poll.channelId);
    if (!channel?.isTextBased()) return;

    const message = await channel.messages.fetch(poll.messageId);
    const embed = buildResultsEmbed(poll, true);
    const components = buildPollButtons(poll, true);

    await message.edit({ embeds: [embed], components });
  } catch (err) {
    console.error(`Failed to close poll #${poll.pollId}:`, err.message);
  }
}

async function sweepExpiredPolls(client) {
  const expiredPolls = await Poll.find({
    status: "active",
    deadline: { $ne: null, $lte: new Date() },
  });

  for (const poll of expiredPolls) {
    await closePoll(client, poll);
  }
}

module.exports = function pollSystem(client) {
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isButton()) return;

    const { customId } = interaction;

    if (customId.startsWith("poll_vote:")) {
      return handleVote(interaction);
    }

    if (customId.startsWith("poll_results:")) {
      return handleViewResults(interaction);
    }
  });

  async function handleVote(interaction) {
    const [, pollIdStr, optionId] = interaction.customId.split(":");
    const pollId = parseInt(pollIdStr, 10);

    const poll = await Poll.findOne({
      pollId,
      guildId: interaction.guild?.id,
    });

    if (!poll) {
      return interaction.reply({
        content: "❌ This poll no longer exists.",
        ephemeral: true,
      });
    }

    if (poll.status === "closed" || isPollExpired(poll)) {
      if (poll.status === "active" && isPollExpired(poll)) {
        await closePoll(interaction.client, poll);
      }
      return interaction.reply({
        content: "❌ This poll is closed.",
        ephemeral: true,
      });
    }

    if (!memberCanVote(interaction.member, poll)) {
      return interaction.reply({
        content: "❌ You do not have a role that is allowed to vote in this poll.",
        ephemeral: true,
      });
    }

    const validOption = poll.options.some((o) => o.id === optionId);
    if (!validOption) {
      return interaction.reply({
        content: "❌ Invalid option.",
        ephemeral: true,
      });
    }

    const vote = findOrCreateVote(poll, interaction.user.id);
    let message;

    if (poll.choiceType === "single") {
      const alreadySelected = vote.optionIds.includes(optionId);
      if (alreadySelected) {
        vote.optionIds = [];
        message = "✅ Your vote has been removed.";
      } else {
        vote.optionIds = [optionId];
        const optionLabel = poll.options.find((o) => o.id === optionId)?.label;
        message = `✅ Vote recorded for **${optionLabel}**.`;
      }
    } else {
      const idx = vote.optionIds.indexOf(optionId);
      if (idx >= 0) {
        vote.optionIds.splice(idx, 1);
        message = "✅ Option removed from your vote.";
      } else {
        vote.optionIds.push(optionId);
        const optionLabel = poll.options.find((o) => o.id === optionId)?.label;
        message = `✅ **${optionLabel}** added to your vote.`;
      }
    }

    vote.updatedAt = new Date();
    await poll.save();

    return interaction.reply({ content: message, ephemeral: true });
  }

  async function handleViewResults(interaction) {
    const pollId = parseInt(interaction.customId.split(":")[1], 10);

    const poll = await Poll.findOne({
      pollId,
      guildId: interaction.guild?.id,
    });

    if (!poll) {
      return interaction.reply({
        content: "❌ This poll no longer exists.",
        ephemeral: true,
      });
    }

    const closed = poll.status === "closed" || isPollExpired(poll);
    const embed = buildResultsEmbed(poll, closed);

    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  async function runSweeper() {
    try {
      await sweepExpiredPolls(client);
    } catch (err) {
      console.error("Poll deadline sweeper error:", err);
    }
  }

  setInterval(runSweeper, CHECK_INTERVAL_MS);
  setTimeout(runSweeper, 10_000);
};
