const PollVote = require("../models/pollVote");

async function getPollVotes(poll) {
  const votes = await PollVote.find({ pollId: poll.pollId }).lean();
  if (votes.length === 0 && poll.votes?.length) {
    return poll.votes;
  }
  return votes;
}

module.exports = getPollVotes;
