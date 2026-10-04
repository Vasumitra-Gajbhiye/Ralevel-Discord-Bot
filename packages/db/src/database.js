const mongoose = require("mongoose");
const Counter = require("./models/counter");
const Poll = require("./models/poll");
const Confession = require("./models/confession");
const Task = require("./models/task");
const ModmailTicket = require("./models/modmailTicket");
const ModDm = require("./models/modDm");
const Definition = require("./models/definition");
const DefinitionRequest = require("./models/definitionRequest");

async function seedCounter(counterName, maxValue) {
  if (maxValue <= 0) return;

  await Counter.findOneAndUpdate(
    { _id: counterName },
    { $max: { seq: maxValue } },
    { upsert: true },
  );
}

async function seedCounters() {
  const lastPoll = await Poll.findOne()
    .sort({ pollId: -1 })
    .select("pollId")
    .lean();
  await seedCounter("pollId", lastPoll?.pollId ?? 0);

  const lastConfession = await Confession.findOne()
    .sort({ confessionId: -1 })
    .select("confessionId")
    .lean();
  await seedCounter("confessionId", lastConfession?.confessionId ?? 0);

  const lastTask = await Task.findOne()
    .sort({ createdAt: -1 })
    .select("taskId")
    .lean();
  const taskMax = lastTask
    ? parseInt(lastTask.taskId.split("-")[1], 10) || 0
    : 0;
  await seedCounter("taskId", taskMax);

  const lastDefinition = await Definition.findOne()
    .sort({ definitionId: -1 })
    .select("definitionId")
    .lean();
  await seedCounter("definitionId", lastDefinition?.definitionId ?? 0);

  const lastDefinitionRequest = await DefinitionRequest.findOne()
    .sort({ requestId: -1 })
    .select("requestId")
    .lean();
  await seedCounter("definitionRequestId", lastDefinitionRequest?.requestId ?? 0);
}

module.exports = async () => {
  await mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  await seedCounters();
  await ModmailTicket.ensureModmailIndexes();
  // /dm's atomic claim relies on the unique userId index existing.
  await ModDm.init();
  // Duplicate-term detection relies on the unique subject/board/term index.
  await Definition.init();

  console.log("✅ MongoDB Connected");
};
