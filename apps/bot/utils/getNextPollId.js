const { getNextSequenceId } = require("./getNextSequenceId");

async function getNextPollId() {
  return getNextSequenceId("pollId");
}

module.exports = { getNextPollId };
