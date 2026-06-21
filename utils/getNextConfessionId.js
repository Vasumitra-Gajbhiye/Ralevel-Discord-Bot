const { getNextSequenceId } = require("./getNextSequenceId");

async function getNextConfessionId() {
  return getNextSequenceId("confessionId");
}

module.exports = { getNextConfessionId };
