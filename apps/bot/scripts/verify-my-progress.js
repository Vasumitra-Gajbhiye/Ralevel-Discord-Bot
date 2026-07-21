require("../loadEnv");
const { Task } = require("@ralevel/db");

const mongoose = require("mongoose");

const TEST_USER_ID = "verify-progress-user";
const OTHER_USER_ID = "verify-progress-other";
const TASK_ID_PREFIX = "VERIFY-PROGRESS-";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function baseTask(overrides) {
  return {
    title: "Verification task",
    description: "Used by verify-my-progress.js",
    createdBy: "verify-script",
    assignedTo: [],
    finishedBy: [],
    selected: null,
    ...overrides,
  };
}

const FIXTURES = [
  baseTask({
    taskId: `${TASK_ID_PREFIX}graphic-1`,
    team: "graphic",
    assignedTo: [TEST_USER_ID],
  }),
  baseTask({
    taskId: `${TASK_ID_PREFIX}graphic-2`,
    team: "graphic",
    assignedTo: [TEST_USER_ID],
    finishedBy: [TEST_USER_ID],
    selected: TEST_USER_ID,
  }),
  baseTask({
    taskId: `${TASK_ID_PREFIX}graphic-3`,
    team: "graphic",
    assignedTo: [OTHER_USER_ID],
    selected: OTHER_USER_ID,
  }),
  baseTask({
    taskId: `${TASK_ID_PREFIX}dev-1`,
    team: "dev",
    assignedTo: [TEST_USER_ID],
  }),
  baseTask({
    taskId: `${TASK_ID_PREFIX}dev-2`,
    team: "dev",
    finishedBy: [TEST_USER_ID],
  }),
  baseTask({
    taskId: `${TASK_ID_PREFIX}dev-3`,
    team: "dev",
    assignedTo: [OTHER_USER_ID],
  }),
  baseTask({
    taskId: `${TASK_ID_PREFIX}writer-1`,
    team: "writer",
    assignedTo: [TEST_USER_ID],
    selected: TEST_USER_ID,
  }),
  baseTask({
    taskId: `${TASK_ID_PREFIX}writer-2`,
    team: "writer",
    finishedBy: [TEST_USER_ID],
  }),
];

async function legacyCounts(team, userId) {
  const tasks = await Task.find({ team, taskId: new RegExp(`^${TASK_ID_PREFIX}`) }).lean();

  return {
    totalTasks: tasks.length,
    claimed: tasks.filter((t) => t.assignedTo.includes(userId)).length,
    finished: tasks.filter((t) => t.finishedBy.includes(userId)).length,
    utilised:
      team === "graphic" || team === "writer"
        ? tasks.filter((t) => t.selected === userId).length
        : 0,
  };
}

async function countDocumentCounts(team, userId) {
  const countQueries = [
    Task.countDocuments({ team, taskId: new RegExp(`^${TASK_ID_PREFIX}`) }),
    Task.countDocuments({
      team,
      taskId: new RegExp(`^${TASK_ID_PREFIX}`),
      assignedTo: userId,
    }),
    Task.countDocuments({
      team,
      taskId: new RegExp(`^${TASK_ID_PREFIX}`),
      finishedBy: userId,
    }),
  ];

  if (team === "graphic" || team === "writer") {
    countQueries.push(
      Task.countDocuments({
        team,
        taskId: new RegExp(`^${TASK_ID_PREFIX}`),
        selected: userId,
      }),
    );
  }

  const [totalTasks, claimed, finished, utilised = 0] =
    await Promise.all(countQueries);

  return { totalTasks, claimed, finished, utilised };
}

async function cleanup() {
  await Task.deleteMany({ taskId: new RegExp(`^${TASK_ID_PREFIX}`) });
}

async function verifyTeam(team) {
  const legacy = await legacyCounts(team, TEST_USER_ID);
  const counts = await countDocumentCounts(team, TEST_USER_ID);

  for (const key of Object.keys(legacy)) {
    assert(
      legacy[key] === counts[key],
      `${team} ${key}: legacy=${legacy[key]}, countDocuments=${counts[key]}`,
    );
  }
}

async function main() {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is required to run my-progress verification");
  }

  await mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  try {
    await cleanup();
    await Task.insertMany(FIXTURES);

    for (const team of ["graphic", "dev", "writer"]) {
      await verifyTeam(team);
    }

    console.log("✅ my-progress count verification passed");
  } finally {
    await cleanup();
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error("❌ my-progress verification failed:", err);
  process.exit(1);
});
