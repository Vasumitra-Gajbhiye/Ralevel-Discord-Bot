const fs = require("fs");
const path = require("path");
const { Events } = require("discord.js");
const messageRouter = require("../systems/messageRouter");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function createMockClient() {
  const listeners = new Map();

  return {
    stickies: new Map(),
    on(event, handler) {
      if (!listeners.has(event)) {
        listeners.set(event, []);
      }
      listeners.get(event).push(handler);
    },
    once(event, handler) {
      this.on(event, handler);
    },
    listenerCount(event) {
      return listeners.get(event)?.length ?? 0;
    },
    emitMessageCreate(message) {
      const handlers = listeners.get(Events.MessageCreate) || [];
      return Promise.all(handlers.map((handler) => handler(message)));
    },
  };
}

function createGuildMessage(overrides = {}) {
  return {
    id: overrides.id || "msg-1",
    author: overrides.author || { bot: false, id: "user-1" },
    guild: overrides.guild === null ? null : overrides.guild || { id: "guild-1" },
    channel: {
      id: overrides.channelId || "channel-1",
      parentId: overrides.parentId ?? null,
      send: async () => {},
      ...(overrides.channel || {}),
    },
    content: overrides.content || "hello",
    member: overrides.member || null,
    reference: overrides.reference ?? null,
    mentions: overrides.mentions || { members: new Map() },
    fetchReference: async () => null,
    ...overrides,
  };
}

function testNoStrayMessageCreateRegistrations() {
  const files = [
    "../systems/messageTracker.js",
    "../systems/reputation.js",
    "../systems/sticky.js",
  ];

  const pattern =
    /client\.on\s*\(\s*(Events\.MessageCreate|"messageCreate"|'messageCreate')/;

  for (const relPath of files) {
    const filePath = path.join(__dirname, relPath);
    const source = fs.readFileSync(filePath, "utf8");
    assert(
      !pattern.test(source),
      `${relPath} must not register its own messageCreate listener`
    );
  }
}

async function testSingleListenerRegistration() {
  const client = createMockClient();
  const calls = { tracker: 0, sticky: 0, reputation: 0 };

  messageRouter(client, {
    handleMessageTracker: async () => {
      calls.tracker += 1;
    },
    handleSticky: async () => {
      calls.sticky += 1;
    },
    handleReputation: async () => {
      calls.reputation += 1;
    },
  });

  assert(
    client.listenerCount(Events.MessageCreate) === 1,
    `expected 1 messageCreate listener, got ${client.listenerCount(Events.MessageCreate)}`
  );

  await client.emitMessageCreate(createGuildMessage());

  assert(calls.tracker === 1, "tracker handler should run once");
  assert(calls.sticky === 1, "sticky handler should run once");
  assert(calls.reputation === 1, "reputation handler should run once");
}

async function testSharedGuardsSkipHandlers() {
  const client = createMockClient();
  const calls = { tracker: 0, sticky: 0, reputation: 0 };

  messageRouter(client, {
    handleMessageTracker: async () => {
      calls.tracker += 1;
    },
    handleSticky: async () => {
      calls.sticky += 1;
    },
    handleReputation: async () => {
      calls.reputation += 1;
    },
  });

  await client.emitMessageCreate(
    createGuildMessage({ author: { bot: true, id: "bot-1" } })
  );
  await client.emitMessageCreate(createGuildMessage({ guild: null }));

  assert(calls.tracker === 0, "bot/DM messages should not invoke tracker");
  assert(calls.sticky === 0, "bot/DM messages should not invoke sticky");
  assert(calls.reputation === 0, "bot/DM messages should not invoke reputation");
}

async function testReputationSkippedInDisabledChannel() {
  const originalChannels = process.env.DISABLED_CHANNELS;
  const originalCategories = process.env.DISABLED_CATEGORIES;

  process.env.DISABLED_CHANNELS = "disabled-channel";
  process.env.DISABLED_CATEGORIES = "disabled-category";

  try {
    const client = createMockClient();
    const calls = { tracker: 0, sticky: 0, reputation: 0 };

    messageRouter(client, {
      handleMessageTracker: async () => {
        calls.tracker += 1;
      },
      handleSticky: async () => {
        calls.sticky += 1;
      },
      handleReputation: async () => {
        calls.reputation += 1;
      },
    });

    await client.emitMessageCreate(
      createGuildMessage({ channelId: "disabled-channel" })
    );

    assert(calls.tracker === 1, "tracker should still run in disabled channel");
    assert(calls.sticky === 1, "sticky should still run in disabled channel");
    assert(
      calls.reputation === 0,
      "reputation should be skipped in disabled channel"
    );
  } finally {
    process.env.DISABLED_CHANNELS = originalChannels;
    process.env.DISABLED_CATEGORIES = originalCategories;
  }
}

function testIsReputationDisabledHelper() {
  const originalChannels = process.env.DISABLED_CHANNELS;
  const originalCategories = process.env.DISABLED_CATEGORIES;
  const { isReputationDisabled: checkDisabled } = require("../systems/messageRouter");

  process.env.DISABLED_CHANNELS = "disabled-channel";
  process.env.DISABLED_CATEGORIES = "disabled-category";

  try {
    assert(
      checkDisabled(createGuildMessage({ channelId: "disabled-channel" })),
      "disabled channel should be detected"
    );
    assert(
      checkDisabled(
        createGuildMessage({ channelId: "ok-channel", parentId: "disabled-category" })
      ),
      "disabled category should be detected"
    );
    assert(
      !checkDisabled(createGuildMessage({ channelId: "ok-channel", parentId: "ok-category" })),
      "normal channel should not be disabled"
    );
  } finally {
    process.env.DISABLED_CHANNELS = originalChannels;
    process.env.DISABLED_CATEGORIES = originalCategories;
  }
}

async function main() {
  testNoStrayMessageCreateRegistrations();
  await testSingleListenerRegistration();
  await testSharedGuardsSkipHandlers();
  await testReputationSkippedInDisabledChannel();
  testIsReputationDisabledHelper();

  console.log("verify-message-router: all checks passed");
}

main().catch((err) => {
  console.error("verify-message-router failed:", err.message);
  process.exit(1);
});
