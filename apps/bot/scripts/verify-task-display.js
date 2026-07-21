const fs = require("fs");
const path = require("path");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function testScanOnlyInFallbackHelper() {
  const source = fs.readFileSync(
    path.join(__dirname, "../utils/taskDisplay.js"),
    "utf8",
  );

  const fallbackStart = source.indexOf("async function findDisplayMessageByScan");
  assert(fallbackStart !== -1, "taskDisplay.js must define findDisplayMessageByScan");

  const resolveStart = source.indexOf("async function resolveDisplayMessage");
  const updateStart = source.indexOf("async function updateTaskDisplay");
  assert(resolveStart !== -1, "taskDisplay.js must define resolveDisplayMessage");
  assert(updateStart !== -1, "taskDisplay.js must define updateTaskDisplay");

  const hotPath = source.slice(resolveStart, updateStart);
  assert(
    !hotPath.includes("limit: 50"),
    "resolveDisplayMessage must not scan 50 messages on the hot path",
  );

  const fallbackBody = source.slice(fallbackStart);
  assert(
    fallbackBody.includes("limit: 50"),
    "findDisplayMessageByScan must retain the 50-message scan fallback",
  );
}

function loadTaskDisplayWithMocks({
  tasks = [],
  storedDoc = null,
  onFindOneAndUpdate,
} = {}) {
  const dbPath = require.resolve("@ralevel/db");
  const utilPath = require.resolve("../utils/taskDisplay.js");
  const realDb = require("@ralevel/db");

  const persisted = { ...storedDoc };

  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: {
      ...realDb,
      Task: {
        find: () => ({
          sort: () => Promise.resolve(tasks),
        }),
      },
      TaskDisplay: {
        findOne: (query) => ({
          lean: async () => {
            if (query.team && persisted.team === query.team) {
              return { ...persisted };
            }
            return null;
          },
        }),
        findOneAndUpdate: async (query, update, options) => {
          if (onFindOneAndUpdate) {
            onFindOneAndUpdate(query, update, options);
          }
          if (query.team) {
            persisted.team = query.team;
          }
          if (update.channelId) {
            persisted.channelId = update.channelId;
          }
          if (update.displayMessageId !== undefined) {
            persisted.displayMessageId = update.displayMessageId;
          }
          return persisted;
        },
        updateOne: async (_query, update) => {
          if (update.displayMessageId !== undefined) {
            persisted.displayMessageId = update.displayMessageId;
          }
        },
      },
    },
  };

  delete require.cache[utilPath];
  return {
    taskDisplay: require("../utils/taskDisplay"),
    getPersisted: () => ({ ...persisted }),
  };
}

function createMockChannel({ storedId, scanMessages = [], missingIds = [] }) {
  const fetchCalls = [];

  const channel = {
    id: "channel-dev",
    client: { user: { id: "bot-user" } },
    messages: {
      fetch: async (arg) => {
        fetchCalls.push(arg);

        if (typeof arg === "string") {
          if (missingIds.includes(arg)) {
            const err = new Error("Unknown Message");
            err.code = 10008;
            throw err;
          }

          if (arg === storedId) {
            return {
              id: storedId,
              author: { id: "bot-user" },
              embeds: [{ title: "Developer Tasks" }],
              edit: async () => {},
            };
          }

          const err = new Error("Unknown Message");
          err.code = 10008;
          throw err;
        }

        if (arg?.limit === 50) {
          return new Map(scanMessages.map((msg) => [msg.id, msg]));
        }

        throw new Error(`unexpected fetch arg: ${JSON.stringify(arg)}`);
      },
    },
    send: async () => ({
      id: "new-display-msg",
    }),
  };

  return {
    channel,
    getFetchCalls: () => [...fetchCalls],
  };
}

async function testStoredIdUsesSingleFetch() {
  const { taskDisplay } = loadTaskDisplayWithMocks({
    tasks: [{ taskId: "tsk-001", title: "Alpha", status: "open" }],
    storedDoc: {
      team: "dev",
      channelId: "channel-dev",
      displayMessageId: "display-123",
    },
  });

  taskDisplay.resetDisplayMessageCache();

  const { channel, getFetchCalls } = createMockChannel({
    storedId: "display-123",
  });

  const messageId = await taskDisplay.updateTaskDisplay(channel, "dev");
  const fetchCalls = getFetchCalls();

  assert(messageId === "display-123", "should edit the stored display message");
  assert(fetchCalls.length === 1, "expected exactly one messages.fetch call");
  assert(
    fetchCalls[0] === "display-123",
    "stored ID path must fetch by message ID, not scan channel history",
  );
}

async function testUnknownMessageFallsBackToScan() {
  const { taskDisplay, getPersisted } = loadTaskDisplayWithMocks({
    tasks: [{ taskId: "tsk-002", title: "Beta", status: "claimed" }],
    storedDoc: {
      team: "dev",
      channelId: "channel-dev",
      displayMessageId: "stale-display",
    },
    onFindOneAndUpdate: () => {},
  });

  taskDisplay.resetDisplayMessageCache();

  const scanMessage = {
    id: "scan-found",
    author: { id: "bot-user" },
    embeds: [{ title: "Developer Tasks" }],
    edit: async () => {},
  };

  const { channel, getFetchCalls } = createMockChannel({
    storedId: "scan-found",
    missingIds: ["stale-display"],
    scanMessages: [scanMessage],
  });

  const messageId = await taskDisplay.updateTaskDisplay(channel, "dev");
  const fetchCalls = getFetchCalls();

  assert(
    fetchCalls.includes("stale-display"),
    "should attempt fetch of stale stored ID first",
  );
  assert(
    fetchCalls.some((call) => call?.limit === 50),
    "should fall back to 50-message scan when stored ID is missing",
  );
  assert(messageId === "scan-found", "should edit message found by scan");
  assert(
    getPersisted().displayMessageId === "scan-found",
    "should persist ID discovered by scan fallback",
  );
}

async function testSecondUpdateSkipsScan() {
  const { taskDisplay } = loadTaskDisplayWithMocks({
    tasks: [{ taskId: "tsk-003", title: "Gamma", status: "open" }],
    storedDoc: {
      team: "dev",
      channelId: "channel-dev",
      displayMessageId: "display-456",
    },
  });

  taskDisplay.resetDisplayMessageCache();

  const { channel, getFetchCalls } = createMockChannel({
    storedId: "display-456",
  });

  await taskDisplay.updateTaskDisplay(channel, "dev");
  const firstCalls = getFetchCalls().length;

  await taskDisplay.updateTaskDisplay(channel, "dev");
  const allCalls = getFetchCalls();

  assert(firstCalls === 1, "first update should use single fetch");
  assert(allCalls.length === 2, "second update should also use single fetch");
  assert(
    !allCalls.some((call) => call?.limit === 50),
    "second update must not scan channel history",
  );
}

async function main() {
  testScanOnlyInFallbackHelper();
  await testStoredIdUsesSingleFetch();
  await testUnknownMessageFallsBackToScan();
  await testSecondUpdateSkipsScan();

  console.log("verify-task-display: all checks passed");
}

main().catch((err) => {
  console.error("verify-task-display failed:", err.message);
  process.exit(1);
});
