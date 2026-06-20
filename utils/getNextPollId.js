const Poll = require("../models/poll");

async function getNextPollId() {
  const last = await Poll.findOne()
    .sort({ pollId: -1 })
    .select("pollId")
    .lean();

  return last ? last.pollId + 1 : 1;
}

module.exports = { getNextPollId };
