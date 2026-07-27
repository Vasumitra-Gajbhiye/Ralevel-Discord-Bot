const {
  resolveChannels,
  purgeUserMessages,
  MS_PER_DAY,
  MANAGE_MESSAGES_PERMISSION,
} = require("../utils/purgeUserMessages");

const TARGET_USER_ID = "user-target";
const OTHER_USER_ID = "user-other";
const BOT_MEMBER_ID = "bot-member";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function createMessage(id, authorId, ageMs) {
  return {
    id,
    author: { id: authorId },
    createdTimestamp: Date.now() - ageMs,
  };
}

function createMockChannel({
  id,
  name,
  parentId = null,
  messages = [],
  canManageMessages = true,
}) {
  const sorted = [...messages].sort(
    (a, b) => b.createdTimestamp - a.createdTimestamp,
  );

  return {
    id,
    name,
    parentId,
    isTextBased: () => true,
    permissionsFor: () =>
      canManageMessages
        ? {
            has: (flag) => flag === MANAGE_MESSAGES_PERMISSION,
          }
        : null,
    messages: {
      fetch: async ({ limit = 100, before } = {}) => {
        let slice = sorted;
        if (before) {
          const index = sorted.findIndex((message) => message.id === before);
          slice = index === -1 ? [] : sorted.slice(index + 1);
        }

        const batch = slice.slice(0, limit);
        const collection = new Map(batch.map((message) => [message.id, message]));
        collection.size = batch.length;
        return collection;
      },
    },
    bulkDelete: async (batch) => {
      const removed = new Map();
      for (const message of batch) {
        removed.set(message.id, message);
      }
      removed.size = batch.length;
      return removed;
    },
  };
}

function createMockGuild(channels) {
  const channelMap = new Map(channels.map((channel) => [channel.id, channel]));

  return {
    id: "guild-1",
    members: {
      me: { id: BOT_MEMBER_ID },
    },
    channels: {
      cache: {
        filter(predicate) {
          const matches = [];
          for (const channel of channelMap.values()) {
            if (predicate(channel)) matches.push(channel);
          }
          return {
            values: () => matches[Symbol.iterator](),
          };
        },
      },
    },
  };
}

function testResolveChannelsAll() {
  const guild = createMockGuild([
    createMockChannel({ id: "b", name: "beta", messages: [] }),
    createMockChannel({ id: "a", name: "alpha", messages: [] }),
    {
      id: "voice",
      name: "voice",
      isTextBased: () => false,
      parentId: null,
    },
  ]);

  const channels = resolveChannels(guild);
  assert(channels.length === 2, "expected only text channels");
  assert(channels[0].name === "alpha", "channels should be sorted by name");
  assert(channels[1].name === "beta", "channels should be sorted by name");
}

function testResolveChannelsCategory() {
  const guild = createMockGuild([
    createMockChannel({
      id: "in-cat",
      name: "in-cat",
      parentId: "cat-1",
      messages: [],
    }),
    createMockChannel({
      id: "outside",
      name: "outside",
      parentId: "cat-2",
      messages: [],
    }),
  ]);

  const channels = resolveChannels(guild, "cat-1");
  assert(channels.length === 1, "expected one channel in category");
  assert(channels[0].id === "in-cat", "expected category channel match");
}

async function testPurgeUserFiltersByUserAndCutoff() {
  const channel = createMockChannel({
    id: "general",
    name: "general",
    messages: [
      createMessage("1", TARGET_USER_ID, 1 * MS_PER_DAY),
      createMessage("2", OTHER_USER_ID, 1 * MS_PER_DAY),
      createMessage("3", TARGET_USER_ID, 10 * MS_PER_DAY),
      createMessage("4", TARGET_USER_ID, 6 * MS_PER_DAY),
      createMessage("5", TARGET_USER_ID, 3 * MS_PER_DAY),
    ],
  });

  const guild = createMockGuild([channel]);
  const progressEvents = [];

  const result = await purgeUserMessages({
    guild,
    userId: TARGET_USER_ID,
    days: 5,
    onProgress: async (event) => {
      progressEvents.push(event);
    },
  });

  assert(result.deleted === 2, "expected only in-window target messages deleted");
  assert(result.channelsScanned === 1, "expected one scanned channel");
  assert(result.channelsSkipped === 0, "expected no skipped channels");
  assert(progressEvents.length === 1, "expected one progress event");
}

async function testPurgeUserPaginatesHistory() {
  const oldMessages = Array.from({ length: 120 }, (_, index) =>
    createMessage(
      `old-${index}`,
      TARGET_USER_ID,
      2 * MS_PER_DAY + index * 1000,
    ),
  );
  const recentMessage = createMessage("recent", TARGET_USER_ID, 1 * MS_PER_DAY);

  const channel = createMockChannel({
    id: "busy",
    name: "busy",
    messages: [recentMessage, ...oldMessages],
  });

  const guild = createMockGuild([channel]);

  const result = await purgeUserMessages({
    guild,
    userId: TARGET_USER_ID,
    days: 5,
  });

  assert(result.deleted === 121, "expected pagination to find all in-window messages");
}

async function testPurgeUserSkipsChannelsWithoutPermission() {
  const allowed = createMockChannel({
    id: "allowed",
    name: "allowed",
    messages: [createMessage("1", TARGET_USER_ID, MS_PER_DAY)],
  });
  const denied = createMockChannel({
    id: "denied",
    name: "denied",
    canManageMessages: false,
    messages: [createMessage("2", TARGET_USER_ID, MS_PER_DAY)],
  });

  const guild = createMockGuild([allowed, denied]);

  const result = await purgeUserMessages({
    guild,
    userId: TARGET_USER_ID,
    days: 5,
  });

  assert(result.deleted === 1, "expected only permitted channel deletions");
  assert(result.channelsSkipped === 1, "expected one skipped channel");
  assert(result.channelsScanned === 1, "expected one scanned channel");
}

async function run() {
  testResolveChannelsAll();
  testResolveChannelsCategory();
  await testPurgeUserFiltersByUserAndCutoff();
  await testPurgeUserPaginatesHistory();
  await testPurgeUserSkipsChannelsWithoutPermission();
  console.log("verify-purge-user: all tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
