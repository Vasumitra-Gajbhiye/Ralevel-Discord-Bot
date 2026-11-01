const path = require("path");
const { PermissionsBitField, ApplicationCommandType } = require("discord.js");
const realDb = require("@ralevel/db");
const { buildDefaultGuildConfig } = realDb;
const { createBoundedSet } = require("../utils/boundedSet.js");
const {
  setGuildConfig,
  tryGetGuildConfig,
} = require("../utils/guildConfigStore");
const { getCommandCatalog } = require("@ralevel/shared/commandCatalog");
const {
  validateCommandDisplayNames,
} = require("@ralevel/shared/commandDisplayNames");
const {
  applyMetadataOverride,
  validateCommandMetadataOverrides,
} = require("@ralevel/shared/commandMetadataOverrides");
const { loadCommandPayloads } = require("@ralevel/shared/registerGuildCommands");

const DAY_MS = 24 * 60 * 60 * 1000;

function setupTestGuildConfig() {
  const config = buildDefaultGuildConfig("guild1");
  const beginner = config.roles.find((role) => role.key === "beginner");
  if (beginner) beginner.roleId = "role-beginner";
  setGuildConfig(config);
}

// Runs `fn` with a modified copy of the guild config, then restores it.
async function withGuildConfig(mutate, fn) {
  const original = tryGetGuildConfig();
  const copy = structuredClone(original);
  mutate(copy);
  setGuildConfig(copy);
  try {
    return await fn();
  } finally {
    setGuildConfig(original);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function createQueryTracker() {
  const counts = {
    repBanExists: 0,
    repBanFind: 0,
    reputationFindOneAndUpdate: 0,
    reputationBulkWrite: 0,
    reputationFind: 0,
    repGrantCreate: 0,
  };

  const repBans = new Set();
  const reps = new Map();
  const grants = new Map();

  const RepBan = {
    exists: async ({ userId }) => {
      counts.repBanExists += 1;
      return repBans.has(userId) ? { _id: userId } : null;
    },
    find: (query) => ({
      select: () => ({
        lean: async () => {
          counts.repBanFind += 1;
          const ids = query.userId?.$in || [];
          return ids.filter((id) => repBans.has(id)).map((userId) => ({ userId }));
        },
      }),
    }),
  };

  const Reputation = {
    findOneAndUpdate: async (filter, update) => {
      counts.reputationFindOneAndUpdate += 1;
      const current = reps.get(filter.userId) ?? 0;
      const next = current + (update.$inc?.rep ?? 0);
      reps.set(filter.userId, next);
      return { userId: filter.userId, rep: next };
    },
    bulkWrite: async (ops) => {
      counts.reputationBulkWrite += 1;
      for (const op of ops) {
        const userId = op.updateOne.filter.userId;
        const current = reps.get(userId) ?? 0;
        reps.set(userId, current + (op.updateOne.update.$inc?.rep ?? 0));
      }
      return { ok: 1 };
    },
    find: (query) => ({
      select: () => ({
        lean: async () => {
          counts.reputationFind += 1;
          const ids = query.userId?.$in || [];
          return ids.map((userId) => ({
            userId,
            rep: reps.get(userId) ?? 0,
          }));
        },
      }),
    }),
  };

  const RepGrant = {
    create: async (doc) => {
      counts.repGrantCreate += 1;
      const key = `${doc.messageId}:${doc.giverId}`;
      if (grants.has(key)) {
        const err = new Error("E11000 duplicate key error");
        err.code = 11000;
        throw err;
      }
      grants.set(key, doc);
      return doc;
    },
  };

  return { counts, repBans, reps, grants, RepBan, Reputation, RepGrant };
}

const RELOADED = [
  "../utils/repAwards.js",
  "../systems/reputation.js",
  "../commands/reputation/give-rep.js",
];

function loadWithMocks(tracker) {
  const dbPath = require.resolve("@ralevel/db");

  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: {
      ...realDb,
      RepBan: tracker.RepBan,
      Reputation: tracker.Reputation,
      RepGrant: tracker.RepGrant,
    },
  };
  for (const rel of RELOADED) delete require.cache[require.resolve(rel)];

  return {
    reputationSystem: require("../systems/reputation.js"),
    giveRep: require("../commands/reputation/give-rep.js"),
  };
}

function loadReputationWithMocks(tracker) {
  return loadWithMocks(tracker).reputationSystem;
}

function createMockGuild(member) {
  return {
    members: {
      me: {
        permissions: {
          has: (flag) => flag === PermissionsBitField.Flags.ManageRoles,
        },
      },
      fetch: async (id) => (id === member.id ? member : null),
    },
  };
}

function createMockMember(id, { bot = false } = {}) {
  return {
    id,
    user: { id, bot },
    partial: false,
    roles: {
      remove: async () => {},
      add: async () => {},
    },
    toString: () => `<@${id}>`,
  };
}

async function testIncrementReputationQueryCount() {
  const tracker = createQueryTracker();
  const reputation = loadReputationWithMocks(tracker);

  const rep = await reputation.incrementReputation("user-1");

  assert(rep === 1, "incrementReputation should return new rep total");
  assert(
    tracker.counts.repBanExists === 1,
    `expected 1 RepBan.exists call, got ${tracker.counts.repBanExists}`
  );
  assert(
    tracker.counts.reputationFindOneAndUpdate === 1,
    `expected 1 findOneAndUpdate call, got ${tracker.counts.reputationFindOneAndUpdate}`
  );
  assert(
    tracker.counts.repBanFind === 0,
    "single-user path should not use RepBan.find"
  );
}

async function testIncrementReputationSkipsBannedUser() {
  const tracker = createQueryTracker();
  tracker.repBans.add("banned-user");
  const reputation = loadReputationWithMocks(tracker);

  const rep = await reputation.incrementReputation("banned-user");

  assert(rep === null, "banned user should not receive rep");
  assert(
    tracker.counts.reputationFindOneAndUpdate === 0,
    "banned user should not trigger reputation write"
  );
}

async function testIncrementReputationBatchQueryCount() {
  const tracker = createQueryTracker();
  tracker.reps.set("user-1", 4);
  tracker.reps.set("user-2", 9);
  tracker.reps.set("user-3", 0);
  const reputation = loadReputationWithMocks(tracker);

  const awards = await reputation.incrementReputationBatch([
    "user-1",
    "user-2",
    "user-3",
  ]);

  assert(awards.length === 3, "all eligible users should be awarded");
  assert(
    tracker.counts.repBanFind === 1,
    `expected 1 RepBan.find call, got ${tracker.counts.repBanFind}`
  );
  assert(
    tracker.counts.reputationBulkWrite === 1,
    `expected 1 bulkWrite call, got ${tracker.counts.reputationBulkWrite}`
  );
  assert(
    tracker.counts.reputationFind === 1,
    `expected 1 Reputation.find call, got ${tracker.counts.reputationFind}`
  );
  assert(
    tracker.counts.repBanExists === 0,
    "batch path should not use RepBan.exists"
  );
}

async function testIncrementReputationBatchExcludesBanned() {
  const tracker = createQueryTracker();
  tracker.repBans.add("user-2");
  const reputation = loadReputationWithMocks(tracker);

  const awards = await reputation.incrementReputationBatch([
    "user-1",
    "user-2",
    "user-3",
  ]);

  assert(awards.length === 2, "banned user should be excluded from awards");
  assert(
    !awards.some((entry) => entry.userId === "user-2"),
    "banned user should not appear in batch results"
  );
}

async function testEnsureTierRoleUsesPassedRepWithoutDb() {
  const tracker = createQueryTracker();
  const reputation = loadReputationWithMocks(tracker);
  const member = createMockMember("user-1");
  const guild = createMockGuild(member);

  const added = await reputation.ensureTierRoleAndCheckAdded(
    guild,
    member,
    null,
    10
  );

  assert(added === true, "tier role should be added at 10 rep");
  assert(
    tracker.counts.repBanExists === 0 &&
      tracker.counts.repBanFind === 0 &&
      tracker.counts.reputationFindOneAndUpdate === 0 &&
      tracker.counts.reputationBulkWrite === 0 &&
      tracker.counts.reputationFind === 0,
    "ensureTierRoleAndCheckAdded should not query MongoDB when rep is passed"
  );
}

async function testMentionHandlerSendsOneMessage() {
  const tracker = createQueryTracker();
  const reputationSystem = loadReputationWithMocks(tracker);
  const handleReputationMessage = reputationSystem({});

  let sendCount = 0;
  const channel = {
    send: async () => {
      sendCount += 1;
    },
  };

  const members = new Map([
    ["user-1", createMockMember("user-1")],
    ["user-2", createMockMember("user-2")],
    ["user-3", createMockMember("user-3")],
  ]);

  await handleReputationMessage({
    id: "msg-mentions",
    content: "thanks @user-1 @user-2 @user-3",
    author: { id: "author-1" },
    reference: null,
    guild: createMockGuild(createMockMember("author-1")),
    channel,
    mentions: { members },
    fetchReference: async () => null,
  });

  assert(sendCount === 1, `expected 1 channel message, got ${sendCount}`);
  assert(
    tracker.counts.repBanFind === 1 &&
      tracker.counts.reputationBulkWrite === 1 &&
      tracker.counts.reputationFind === 1,
    "mention handler should use batched DB operations"
  );
}

async function testDuplicateMessageIsIgnored() {
  const tracker = createQueryTracker();
  const reputationSystem = loadReputationWithMocks(tracker);
  const handleReputationMessage = reputationSystem({});

  let sendCount = 0;
  const channel = {
    send: async () => {
      sendCount += 1;
    },
  };
  const target = createMockMember("user-1");

  const message = {
    id: "msg-dup",
    content: "thanks",
    author: { id: "author-1" },
    reference: { messageId: "prev-msg" },
    guild: createMockGuild(target),
    channel,
    member: createMockMember("author-1"),
    fetchReference: async () => ({
      member: target,
    }),
  };

  await handleReputationMessage(message);
  await handleReputationMessage(message);

  assert(sendCount === 1, `expected 1 channel message, got ${sendCount}`);
  assert(
    tracker.counts.reputationFindOneAndUpdate === 1,
    `expected 1 findOneAndUpdate call, got ${tracker.counts.reputationFindOneAndUpdate}`
  );
}

function testBoundedSetEvictsOldest() {
  const cache = createBoundedSet(3);

  cache.add("a");
  cache.add("b");
  cache.add("c");
  cache.add("d");

  assert(cache.size === 3, `expected cache size 3, got ${cache.size}`);
  assert(!cache.has("a"), "oldest entry should be evicted");
  assert(cache.has("d"), "newest entry should remain");
}

async function testWelcomeReplyToSelfIsIgnored() {
  const tracker = createQueryTracker();
  const reputationSystem = loadReputationWithMocks(tracker);
  const handleReputationMessage = reputationSystem({});

  let sendCount = 0;
  const channel = {
    send: async () => {
      sendCount += 1;
    },
  };
  const author = createMockMember("user-1");

  await handleReputationMessage({
    id: "msg-self-np",
    content: "np",
    author: { id: "user-1" },
    reference: { messageId: "prev-msg" },
    guild: createMockGuild(author),
    channel,
    member: author,
    mentions: { members: new Map() },
    fetchReference: async () => ({
      author: { id: "user-1" },
      member: author,
    }),
  });

  assert(sendCount === 0, `expected 0 channel messages, got ${sendCount}`);
  assert(
    tracker.counts.reputationFindOneAndUpdate === 0,
    `expected 0 findOneAndUpdate calls, got ${tracker.counts.reputationFindOneAndUpdate}`
  );
}

function createChannel({ id = "channel-1", parentId = null } = {}) {
  const sent = [];
  return {
    id,
    parentId,
    sent,
    send: async (content) => {
      sent.push(content);
    },
  };
}

function createGiveRepInteraction({
  giverId = "giver",
  target = createMockMember("helper"),
  authorBot = false,
  inServer = true,
  channel = createChannel(),
  messageId = "target-msg",
  createdTimestamp = Date.now(),
} = {}) {
  const replies = [];
  let deferred = false;
  const guild = createMockGuild(inServer ? target : createMockMember("nobody"));

  return {
    replies,
    channel,
    get deferred() {
      return deferred;
    },
    interaction: {
      user: { id: giverId },
      guild,
      channel,
      targetMessage: {
        id: messageId,
        author: { id: target.id, bot: authorBot },
        member: null,
        channel,
        createdTimestamp,
      },
      reply: async (options) => {
        replies.push(options.content);
      },
      deferReply: async () => {
        deferred = true;
      },
      editReply: async (options) => {
        replies.push(options.content);
      },
    },
  };
}

async function testThankReplyCountsOncePerGiverPerMessage() {
  const tracker = createQueryTracker();
  const handle = loadReputationWithMocks(tracker)({});
  const target = createMockMember("helper");
  const channel = createChannel();

  // Two separate "thanks" replies from the same member to the same message.
  for (const id of ["thanks-1", "thanks-2"]) {
    await handle({
      id,
      content: "thanks",
      author: { id: "giver" },
      reference: { messageId: "helpful-msg" },
      guild: createMockGuild(target),
      channel,
      mentions: { members: new Map() },
      fetchReference: async () => ({ member: target }),
    });
  }

  assert(tracker.reps.get("helper") === 1, "second thanks for the same message must not award");
  assert(channel.sent.length === 1, `expected 1 announcement, got ${channel.sent.length}`);
  assert(
    tracker.grants.has("helpful-msg:giver"),
    "thank-you reply should record a grant for the replied-to message"
  );
}

async function testThankReplyToBotIsIgnored() {
  const tracker = createQueryTracker();
  const handle = loadReputationWithMocks(tracker)({});
  const botMember = createMockMember("some-bot", { bot: true });
  const channel = createChannel();

  await handle({
    id: "thanks-bot",
    content: "thanks",
    author: { id: "giver" },
    reference: { messageId: "bot-msg" },
    guild: createMockGuild(botMember),
    channel,
    mentions: { members: new Map() },
    fetchReference: async () => ({ member: botMember }),
  });

  assert(!tracker.reps.has("some-bot"), "bots must not receive rep");
  assert(channel.sent.length === 0, "no announcement for bots");
}

async function testGiveRepAwardsAndAnnounces() {
  const tracker = createQueryTracker();
  tracker.reps.set("helper", 9);
  const { giveRep } = loadWithMocks(tracker);
  const ctx = createGiveRepInteraction();

  await giveRep.execute(ctx.interaction);

  assert(tracker.reps.get("helper") === 10, "Give Rep should add 1 rep");
  assert(ctx.deferred, "Give Rep should defer before awarding");
  assert(
    ctx.channel.sent.includes("+1 Rep → <@helper> (**10**)"),
    `announcement should match automatic rep, got ${JSON.stringify(ctx.channel.sent)}`
  );
  assert(
    ctx.channel.sent.some((m) => m.startsWith("🎉 Congratulations, <@helper>")),
    "reaching a tier should announce the tier role like automatic rep"
  );
  assert(
    ctx.replies.length === 1 && ctx.replies[0].includes("now **10**"),
    `unexpected reply: ${JSON.stringify(ctx.replies)}`
  );
  assert(tracker.grants.has("target-msg:giver"), "Give Rep should record a grant");
}

async function testGiveRepRefusesDuplicates() {
  const tracker = createQueryTracker();
  const { reputationSystem, giveRep } = loadWithMocks(tracker);
  const target = createMockMember("helper");

  // Thank-you reply first, then Give Rep on the same message by the same member.
  await reputationSystem({})({
    id: "thanks-1",
    content: "thanks",
    author: { id: "giver" },
    reference: { messageId: "target-msg" },
    guild: createMockGuild(target),
    channel: createChannel(),
    mentions: { members: new Map() },
    fetchReference: async () => ({ member: target }),
  });
  const afterThanks = createGiveRepInteraction({ target });
  await giveRep.execute(afterThanks.interaction);

  assert(tracker.reps.get("helper") === 1, "Give Rep after thanks must not award again");
  assert(
    afterThanks.replies[0]?.includes("already given rep"),
    `expected duplicate reply, got ${JSON.stringify(afterThanks.replies)}`
  );
  assert(afterThanks.channel.sent.length === 0, "duplicate must not announce");

  // Give Rep twice.
  const again = createGiveRepInteraction({ target, messageId: "other-msg" });
  await giveRep.execute(again.interaction);
  const twice = createGiveRepInteraction({ target, messageId: "other-msg" });
  await giveRep.execute(twice.interaction);
  assert(tracker.reps.get("helper") === 2, "second Give Rep on the same message must not award");
  assert(twice.replies[0]?.includes("already given rep"), "second Give Rep should say so");

  // A different giver can still rep the same message.
  const otherGiver = createGiveRepInteraction({
    target,
    giverId: "giver-2",
    messageId: "other-msg",
  });
  await giveRep.execute(otherGiver.interaction);
  assert(tracker.reps.get("helper") === 3, "another giver can rep the same message");

  // Give Rep first, then a thank-you reply to that message.
  const channel = createChannel();
  await reputationSystem({})({
    id: "thanks-2",
    content: "thanks",
    author: { id: "giver" },
    reference: { messageId: "other-msg" },
    guild: createMockGuild(target),
    channel,
    mentions: { members: new Map() },
    fetchReference: async () => ({ member: target }),
  });
  assert(tracker.reps.get("helper") === 3, "thanks after Give Rep must not award again");
  assert(channel.sent.length === 0, "thanks after Give Rep must not announce");
}

async function testGiveRepRejections() {
  const cases = [
    {
      label: "self",
      ctx: () => createGiveRepInteraction({ giverId: "helper" }),
      expect: "yourself",
    },
    {
      label: "bot",
      ctx: () =>
        createGiveRepInteraction({
          target: createMockMember("bot-1", { bot: true }),
          authorBot: true,
        }),
      expect: "Bots",
    },
    {
      label: "too old",
      ctx: () => createGiveRepInteraction({ createdTimestamp: Date.now() - 31 * DAY_MS }),
      expect: "last 30 days",
    },
    {
      label: "left server",
      ctx: () => createGiveRepInteraction({ inServer: false }),
      expect: "isn't in the server",
    },
  ];

  for (const { label, ctx: makeCtx, expect } of cases) {
    const tracker = createQueryTracker();
    const { giveRep } = loadWithMocks(tracker);
    const ctx = makeCtx();
    await giveRep.execute(ctx.interaction);
    assert(
      ctx.replies[0]?.includes(expect),
      `${label}: expected reply containing "${expect}", got ${JSON.stringify(ctx.replies)}`
    );
    assert(tracker.reps.size === 0, `${label}: no rep should be awarded`);
    assert(tracker.counts.repGrantCreate === 0, `${label}: no grant should be recorded`);
    assert(ctx.channel.sent.length === 0, `${label}: nothing should be announced`);
  }

  // Rep-banned member: no award, no grant.
  const tracker = createQueryTracker();
  tracker.repBans.add("helper");
  const { giveRep } = loadWithMocks(tracker);
  const banned = createGiveRepInteraction();
  await giveRep.execute(banned.interaction);
  assert(banned.replies[0]?.includes("can't receive reputation"), "rep-banned reply");
  assert(!tracker.reps.has("helper"), "rep-banned member must not receive rep");
  assert(tracker.counts.repGrantCreate === 0, "rep-banned award must not record a grant");
}

async function testGiveRepRespectsConfig() {
  const runWith = async (mutate, channel) => {
    const tracker = createQueryTracker();
    const { giveRep } = loadWithMocks(tracker);
    const ctx = createGiveRepInteraction({ channel });
    await withGuildConfig(mutate, () => giveRep.execute(ctx.interaction));
    assert(tracker.reps.size === 0, "no rep should be awarded");
    return ctx.replies[0] || "";
  };

  const off = await runWith((cfg) => {
    cfg.features = { ...cfg.features, reputation: false };
  });
  assert(off.includes("turned off"), `feature off: got "${off}"`);

  const channelOff = await runWith(
    (cfg) => {
      cfg.reputation.disabledChannels = ["no-rep-channel"];
    },
    createChannel({ id: "no-rep-channel" })
  );
  assert(channelOff.includes("disabled in this channel"), `disabled channel: got "${channelOff}"`);

  const categoryOff = await runWith(
    (cfg) => {
      cfg.reputation.disabledCategories = [{ id: "no-rep-category" }];
    },
    createChannel({ id: "channel-9", parentId: "no-rep-category" })
  );
  assert(categoryOff.includes("disabled in this channel"), `disabled category: got "${categoryOff}"`);
}

async function testGiveRepIgnoresContentOptOut() {
  const tracker = createQueryTracker();
  const { giveRep } = loadWithMocks(tracker);
  const { setContentOptOut, isContentOptedOut } = require("../utils/contentOptOut");
  const realUpdateOne = realDb.UserPrivacy.updateOne;
  realDb.UserPrivacy.updateOne = async () => ({ acknowledged: true });
  try {
    await setContentOptOut("giver", true);
    await setContentOptOut("helper", true);
  } finally {
    realDb.UserPrivacy.updateOne = realUpdateOne;
  }
  assert(isContentOptedOut("giver") && isContentOptedOut("helper"), "both should be opted out");

  const ctx = createGiveRepInteraction();
  // Give Rep must never look at the message text.
  Object.defineProperty(ctx.interaction.targetMessage, "content", {
    get() {
      throw new Error("Give Rep read message content");
    },
  });
  await giveRep.execute(ctx.interaction);

  assert(tracker.reps.get("helper") === 1, "opted-out members can give and receive via Give Rep");
}

function testGiveRepRegistration() {
  const tracker = createQueryTracker();
  const { giveRep } = loadWithMocks(tracker);
  const payload = giveRep.data.toJSON();

  assert(payload.name === "Give Rep", `unexpected name ${payload.name}`);
  assert(payload.type === ApplicationCommandType.Message, "Give Rep must be a message context menu");
  assert(!payload.default_member_permissions, "Give Rep must be visible to everyone");
  assert(
    Array.isArray(realDb.DEFAULT_COMMAND_PERMISSIONS["Give Rep"]) &&
      realDb.DEFAULT_COMMAND_PERMISSIONS["Give Rep"].length === 0,
    "Give Rep should have no role gate"
  );
  assert(realDb.DEFAULT_COMMAND_EPHEMERAL["Give Rep"] === true, "Give Rep replies should be ephemeral");
  assert(
    realDb.REP_GRANT_TTL_SEC === 30 * 24 * 60 * 60,
    "grant TTL and the Give Rep age limit should both be 30 days"
  );

  const catalogEntry = getCommandCatalog().find((c) => c.name === "Give Rep");
  assert(catalogEntry?.payload?.type === ApplicationCommandType.Message, "catalog should include Give Rep");

  const deployed = loadCommandPayloads(path.join(__dirname, "..", "commands"));
  const deployedGiveRep = deployed.find((c) => c.name === "Give Rep");
  assert(
    deployedGiveRep?.payload?.type === ApplicationCommandType.Message &&
      deployedGiveRep.payload.description === undefined,
    "deploy payload should be a message context menu without a description"
  );
  assert(
    deployed.find((c) => c.name === "my-reputation")?.payload?.description,
    "slash command payloads should be unchanged"
  );
}

function testDashboardOverridesSkipContextMenus() {
  const catalog = getCommandCatalog();

  const rename = validateCommandDisplayNames(catalog, { "Give Rep": "give-rep" });
  assert(!rename.ok, "renaming a context menu should be rejected");
  const slashRename = validateCommandDisplayNames(catalog, { "my-reputation": "my-rep-2" });
  assert(slashRename.ok, "renaming a slash command should still work");

  const metadata = validateCommandMetadataOverrides(catalog, {
    "Give Rep": { description: "nope" },
  });
  assert(!metadata.ok, "a description override on a context menu should be rejected");

  const payload = catalog.find((c) => c.name === "Give Rep").payload;
  const applied = applyMetadataOverride(payload, { description: "nope" });
  assert(applied.description === undefined, "deploy must never add a description to a context menu");
}

async function testCommandLoaderRoutesContextMenus() {
  const redisPath = require.resolve("../redis");
  if (!require.cache[redisPath]) {
    require.cache[redisPath] = {
      id: redisPath,
      filename: redisPath,
      loaded: true,
      exports: {},
    };
  }

  const listeners = [];
  const client = {
    on: (event, handler) => {
      if (event === "interactionCreate") listeners.push(handler);
    },
  };
  require("../systems/commands.js")(client);
  assert(client.commands.has("Give Rep"), "loader should register Give Rep");

  const executed = [];
  const stub = (name) => ({
    execute: async (interaction) => {
      executed.push(name);
      await interaction.reply({ content: "ok" });
    },
  });
  client.commands.set("Give Rep", stub("Give Rep"));
  client.commands.set("my-reputation", stub("my-reputation"));

  const makeInteraction = ({ commandName, chatInput, contextMenu }) => {
    const sent = [];
    return {
      sent,
      commandName,
      member: { roles: { cache: { some: () => true } } },
      guild: null,
      isAutocomplete: () => false,
      isChatInputCommand: () => chatInput,
      isContextMenuCommand: () => contextMenu,
      deferReply: async () => {},
      reply: async (options) => {
        sent.push(options);
      },
    };
  };

  const menu = makeInteraction({ commandName: "Give Rep", chatInput: false, contextMenu: true });
  const slash = makeInteraction({ commandName: "my-reputation", chatInput: true, contextMenu: false });
  const button = makeInteraction({ commandName: undefined, chatInput: false, contextMenu: false });
  for (const handler of listeners) {
    await handler(menu);
    await handler(slash);
    await handler(button);
  }

  assert(
    JSON.stringify(executed) === JSON.stringify(["Give Rep", "my-reputation"]),
    `unexpected executions: ${executed.join(", ")}`
  );
  assert(menu.sent[0]?.ephemeral === true, "Give Rep reply should use the ephemeral default");
  assert(slash.sent[0]?.ephemeral === false, "slash ephemeral setting should be unchanged");
}

async function main() {
  setupTestGuildConfig();
  await testIncrementReputationQueryCount();
  await testIncrementReputationSkipsBannedUser();
  await testIncrementReputationBatchQueryCount();
  await testIncrementReputationBatchExcludesBanned();
  await testEnsureTierRoleUsesPassedRepWithoutDb();
  await testMentionHandlerSendsOneMessage();
  await testDuplicateMessageIsIgnored();
  await testWelcomeReplyToSelfIsIgnored();
  testBoundedSetEvictsOldest();
  await testThankReplyCountsOncePerGiverPerMessage();
  await testThankReplyToBotIsIgnored();
  await testGiveRepAwardsAndAnnounces();
  await testGiveRepRefusesDuplicates();
  await testGiveRepRejections();
  await testGiveRepRespectsConfig();
  await testGiveRepIgnoresContentOptOut();
  testGiveRepRegistration();
  testDashboardOverridesSkipContextMenus();
  await testCommandLoaderRoutesContextMenus();

  console.log("verify-reputation-system: all checks passed");
  // The command loader requires every command module.
  process.exit(0);
}

main().catch((err) => {
  console.error("verify-reputation-system failed:", err.message);
  process.exit(1);
});
