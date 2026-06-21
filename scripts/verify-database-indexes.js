require("dotenv").config();

const mongoose = require("mongoose");
const Reputation = require("../models/reputation");
const User = require("../models/User");
const Task = require("../models/task");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function normalizeKeyPattern(keyPattern) {
  if (!keyPattern) return null;
  if (typeof keyPattern === "object" && !Array.isArray(keyPattern)) {
    return keyPattern;
  }
  if (typeof keyPattern === "string") {
    const parsed = {};
    for (const match of keyPattern.matchAll(/(\w+):\s*(-?\d+)/g)) {
      parsed[match[1]] = Number(match[2]);
    }
    return Object.keys(parsed).length > 0 ? parsed : null;
  }
  return null;
}

function indexKeysMatch(index, expectedKey) {
  const actual = normalizeKeyPattern(index.key ?? index.keyPattern);
  if (!actual) return false;

  const expectedKeys = Object.keys(expectedKey);
  return (
    expectedKeys.length === Object.keys(actual).length &&
    expectedKeys.every((field) => actual[field] === expectedKey[field])
  );
}

function hasIndex(indexes, expectedKey) {
  const indexList = Array.isArray(indexes)
    ? indexes
    : Object.values(indexes).map((keySpec) => ({
        key: Object.fromEntries(keySpec),
      }));

  return indexList.some((index) => indexKeysMatch(index, expectedKey));
}

function collectPlanStages(plan, stages = []) {
  if (!plan) return stages;

  if (plan.stage) {
    stages.push(plan);
  }

  if (plan.inputStage) {
    collectPlanStages(plan.inputStage, stages);
  }

  if (plan.inputStages) {
    for (const stage of plan.inputStages) {
      collectPlanStages(stage, stages);
    }
  }

  if (plan.shards) {
    for (const shard of plan.shards) {
      collectPlanStages(shard.winningPlan || shard, stages);
    }
  }

  return stages;
}

function planUsesIndex(explain, expectedKey) {
  const winningPlan =
    explain?.queryPlanner?.winningPlan ||
    explain?.executionStats?.executionStages;
  const stages = collectPlanStages(winningPlan);

  return stages.some((stage) => {
    if (!stage.indexName || stage.indexName === "_id_") {
      return false;
    }

    const usesIndexStage =
      stage.stage === "IXSCAN" || stage.stage === "EXPRESS_IXSCAN";

    if (!stage.keyPattern) {
      return usesIndexStage;
    }

    return indexKeysMatch(stage, expectedKey);
  });
}

async function verifyIndexesExist() {
  const [repIndexes, userIndexes, taskIndexes] = await Promise.all([
    Reputation.collection.getIndexes(),
    User.collection.getIndexes(),
    Task.collection.getIndexes(),
  ]);

  assert(
    hasIndex(repIndexes, { rep: -1 }),
    "reputations collection missing { rep: -1 } index",
  );
  assert(
    hasIndex(userIndexes, { xp: -1 }),
    "users collection missing { xp: -1 } index",
  );
  assert(
    hasIndex(taskIndexes, { team: 1 }),
    "tasks collection missing { team: 1 } index",
  );
  assert(
    hasIndex(taskIndexes, { team: 1, assignedTo: 1 }),
    "tasks collection missing { team: 1, assignedTo: 1 } index",
  );
  assert(
    hasIndex(taskIndexes, { team: 1, finishedBy: 1 }),
    "tasks collection missing { team: 1, finishedBy: 1 } index",
  );
  assert(
    hasIndex(taskIndexes, { team: 1, selected: 1 }),
    "tasks collection missing { team: 1, selected: 1 } index",
  );
}

async function verifyQueryPlans() {
  const testUserId = "test-user";

  const [
    repExplain,
    userExplain,
    taskExplain,
    taskAssignedExplain,
    taskFinishedExplain,
    taskSelectedExplain,
  ] = await Promise.all([
    Reputation.find().sort({ rep: -1 }).limit(10).explain("executionStats"),
    User.find().sort({ xp: -1 }).limit(10).explain("executionStats"),
    Task.find({ team: "dev" }).limit(1).explain("executionStats"),
    Task.find({ team: "dev", assignedTo: testUserId })
      .limit(1)
      .explain("executionStats"),
    Task.find({ team: "dev", finishedBy: testUserId })
      .limit(1)
      .explain("executionStats"),
    Task.find({ team: "graphic", selected: testUserId })
      .limit(1)
      .explain("executionStats"),
  ]);

  assert(
    planUsesIndex(repExplain, { rep: -1 }),
    "leaderboard query does not use { rep: -1 } index",
  );
  assert(
    planUsesIndex(userExplain, { xp: -1 }),
    "xp sort query does not use { xp: -1 } index",
  );
  assert(
    planUsesIndex(taskExplain, { team: 1 }),
    "Task.find({ team }) does not use { team: 1 } index",
  );
  assert(
    planUsesIndex(taskAssignedExplain, { team: 1, assignedTo: 1 }),
    "Task progress assignedTo query does not use { team: 1, assignedTo: 1 } index",
  );
  assert(
    planUsesIndex(taskFinishedExplain, { team: 1, finishedBy: 1 }),
    "Task progress finishedBy query does not use { team: 1, finishedBy: 1 } index",
  );
  assert(
    planUsesIndex(taskSelectedExplain, { team: 1, selected: 1 }),
    "Task progress selected query does not use { team: 1, selected: 1 } index",
  );
}

async function main() {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is required to run database index verification");
  }

  await mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  try {
    await Promise.all([
      Reputation.syncIndexes(),
      User.syncIndexes(),
      Task.syncIndexes(),
    ]);

    await verifyIndexesExist();
    await verifyQueryPlans();

    console.log("✅ database index verification passed");
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error("❌ database index verification failed:", err);
  process.exit(1);
});
