const Counter = require("../models/counter");

async function getNextSequenceId(counterName) {
  const doc = await Counter.findOneAndUpdate(
    { _id: counterName },
    { $inc: { seq: 1 } },
    { new: true, upsert: true },
  );

  return doc.seq;
}

module.exports = { getNextSequenceId };
