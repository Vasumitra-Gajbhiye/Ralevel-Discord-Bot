const { ChannelType, Events } = require("discord.js");
const {
  ModDm,
  ModmailTicket,
  ModmailBan,
  ModmailMessageLink,
} = require("@ralevel/db");
const modDm = require("../systems/modDm");
const modmailSystem = require("../systems/modmail");
const messageRouter = require("../systems/messageRouter");
const { setGuildConfig, tryGetGuildConfig } = require("../utils/guildConfigStore");

const MOD_DM_FORUM = "moddm-forum";
const MODMAIL_FORUM = "modmail-forum";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

let nextId = 1;
function id(prefix) {
  return `${prefix}-${nextId++}`;
}

/** Mongoose-style query stub: awaitable directly or via .lean() / .select(). */
function query(value) {
  const q = {
    lean: async () => value,
    select: () => q,
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
  };
  return q;
}

async function withStubs(stubs, fn) {
  const originals = [];
  for (const [target, key, value] of stubs) {
    originals.push([target, key, target[key]]);
    target[key] = value;
  }
  try {
    return await fn();
  } finally {
    for (const [target, key, value] of originals.reverse()) target[key] = value;
  }
}

function dmClosedError() {
  const err = new Error("Cannot send messages to this user");
  err.code = 50007;
  return err;
}

function makeThread(overrides = {}) {
  const sent = [];
  const thread = {
    id: overrides.id || id("thread"),
    parentId: MOD_DM_FORUM,
    archived: false,
    sent,
    archivedCalls: [],
    deleted: false,
    isThread: () => true,
    send: async (payload) => {
      const msg = { id: id("thread-msg"), payload };
      sent.push(payload);
      return msg;
    },
    setArchived: async (value) => {
      thread.archived = value;
      thread.archivedCalls.push(value);
    },
    delete: async () => {
      thread.deleted = true;
    },
    ...overrides,
  };
  return thread;
}

function makeUser(overrides = {}) {
  const sent = [];
  const user = {
    id: overrides.id || "user-1",
    username: "someone",
    tag: "someone",
    bot: false,
    sent,
    send: async (payload) => {
      sent.push(payload);
      return { id: id("dm-msg"), payload };
    },
    toString: () => `<@${overrides.id || "user-1"}>`,
    ...overrides,
  };
  return user;
}

function makeClient({ channels = {}, users = {} } = {}) {
  const listeners = new Map();
  return {
    listeners,
    on(event, handler) {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event).push(handler);
    },
    channels: {
      fetch: async (channelId) => {
        if (channels[channelId]) return channels[channelId];
        const err = new Error("Unknown Channel");
        err.code = 10003;
        throw err;
      },
    },
    users: {
      fetch: async (userId) => {
        if (users[userId]) return users[userId];
        throw new Error("Unknown User");
      },
    },
  };
}

function makeDmMessage(userId, content = "hello") {
  const sent = [];
  return {
    sent,
    message: {
      id: id("dm"),
      author: { id: userId, bot: false },
      guild: null,
      content,
      attachments: new Map(),
      stickers: new Map(),
      embeds: [],
      reference: null,
      channel: { send: async (payload) => sent.push(payload) },
    },
  };
}

function makeStaffMessage(thread, content) {
  const replies = [];
  return {
    replies,
    message: {
      id: id("staff"),
      author: { id: "mod-1", bot: false },
      guild: { id: "guild-1" },
      content,
      attachments: new Map(),
      stickers: new Map(),
      embeds: [],
      reference: null,
      channel: thread,
      reply: async (payload) => replies.push(payload),
    },
  };
}

function openDoc(overrides = {}) {
  return {
    _id: "doc-1",
    userId: "user-1",
    guildId: "guild-1",
    threadId: "thread-open",
    status: "OPEN",
    session: 1,
    optedOutAt: null,
    introMessageId: null,
    ...overrides,
  };
}

function trackUpdates() {
  const updates = [];
  return {
    updates,
    stub: async (filter, update) => {
      updates.push({ filter, update });
      return { modifiedCount: 1, matchedCount: 1 };
    },
  };
}

// ---------------------------------------------------------------------------

function testSplitMessageContent() {
  const long = Array.from({ length: 900 }, (_, i) => `word${i}`).join(" ");
  const chunks = modDm.splitMessageContent(long);
  assert(chunks.length > 1, "long text should be split");
  assert(chunks.every((c) => c.length <= 2000), "every chunk must fit in 2000 chars");
  assert(
    chunks.join(" ").replace(/\s+/g, " ") === long,
    "splitting must not lose any text"
  );
  assert(modDm.splitMessageContent("").length === 0, "empty text has no chunks");
  assert(modDm.splitMessageContent("hi").length === 1, "short text is one chunk");
}

function testPlainTextKeepsFormatting() {
  const text = modDm.buildPlainRelayText({
    content: "line one\nline two\n\n```js\ncode()\n```",
    stickers: new Map(),
  });
  assert(text.includes("line one\nline two"), "newlines must be preserved");
  assert(text.includes("```js\ncode()\n```"), "code blocks must be preserved");
}

async function testSendPlainRelayDisablesMentionsAndSplits() {
  const thread = makeThread();
  const { message } = makeDmMessage("user-1", `@everyone ${"x".repeat(2500)}`);
  const first = await modDm.sendPlainRelay(thread, message, {
    replyToMessageId: "reply-target",
  });

  assert(first, "should return the first sent message");
  assert(thread.sent.length === 2, "2500+ chars should become two messages");
  for (const payload of thread.sent) {
    assert(
      Array.isArray(payload.allowedMentions?.parse) &&
        payload.allowedMentions.parse.length === 0,
      "every relay payload must disable mentions"
    );
    assert(!payload.embeds, "relays must be plain text, not embeds");
  }
  assert(
    thread.sent[0].reply?.messageReference === "reply-target",
    "first chunk carries the native reply"
  );
  assert(!thread.sent[1].reply, "later chunks are not replies");
}

async function testUserDmWithoutOpenConversationFallsThrough() {
  const client = makeClient();
  const { message } = makeDmMessage("user-1");
  const handled = await withStubs(
    [[ModDm, "findOne", () => query(null)]],
    () => modDm.handleModDmUserMessage(client, message)
  );
  assert(handled === false, "no open mod DM should fall through to modmail");
}

async function testUserDmRelaysToThread() {
  const thread = makeThread({ id: "thread-open" });
  const client = makeClient({ channels: { "thread-open": thread } });
  const { message } = makeDmMessage("user-1", "hi mods");
  const links = [];

  const handled = await withStubs(
    [
      [ModDm, "findOne", () => query(openDoc())],
      [ModmailMessageLink, "updateOne", async (filter, update) => links.push(update)],
    ],
    () => modDm.handleModDmUserMessage(client, message)
  );

  assert(handled === true, "open mod DM should claim the DM");
  assert(thread.sent.length === 1, "user message should be relayed to the post");
  assert(thread.sent[0].content === "hi mods", "relay should be the plain text");
  assert(links.length === 1, "message link should be saved for reply mapping");
}

async function testUserDmWithDeletedPostEndsConversation() {
  const client = makeClient();
  const { message, sent } = makeDmMessage("user-1");
  const tracker = trackUpdates();

  const handled = await withStubs(
    [
      [ModDm, "findOne", () => query(openDoc({ threadId: "gone" }))],
      [ModDm, "updateOne", tracker.stub],
      [ModmailMessageLink, "deleteMany", async () => ({})],
    ],
    () => modDm.handleModDmUserMessage(client, message)
  );

  assert(handled === true, "deleted post should still be handled here");
  assert(
    tracker.updates.some((u) => u.update.$set?.status === "CLOSED"),
    "conversation should be closed"
  );
  assert(
    sent.some((p) => String(p).includes("has ended")),
    "user should be told the conversation ended"
  );
}

async function testStaffNoteIsNotRelayed() {
  const thread = makeThread({ id: "thread-open" });
  const user = makeUser();
  const client = makeClient({ users: { "user-1": user } });
  const { message } = makeStaffMessage(thread, ". internal note");

  const handled = await withStubs(
    [[ModDm, "findOne", () => query(openDoc())]],
    () => modDm.handleModDmStaffReply(client, message)
  );
  assert(handled === true, "notes are still claimed so XP/rep skip them");
  assert(user.sent.length === 0, "notes must not reach the user");
}

async function testStaffReplyInClosedConversationWarns() {
  const thread = makeThread({ id: "thread-open" });
  const user = makeUser();
  const client = makeClient({ users: { "user-1": user } });
  const { message, replies } = makeStaffMessage(thread, "are you there?");

  await withStubs(
    [[ModDm, "findOne", () => query(openDoc({ status: "CLOSED" }))]],
    () => modDm.handleModDmStaffReply(client, message)
  );
  assert(user.sent.length === 0, "closed conversation must not deliver");
  assert(
    replies.some((r) => r.content.includes("conversation is closed")),
    "mod should be told the conversation is closed"
  );
}

async function testStaffReplyDelivers() {
  const thread = makeThread({ id: "thread-open" });
  const user = makeUser();
  const client = makeClient({ users: { "user-1": user } });
  const { message } = makeStaffMessage(thread, "Hey, quick question.");

  await withStubs(
    [
      [ModDm, "findOne", () => query(openDoc())],
      [ModmailMessageLink, "updateOne", async () => ({})],
    ],
    () => modDm.handleModDmStaffReply(client, message)
  );
  assert(user.sent.length === 1, "mod message should be DMed");
  assert(user.sent[0].content === "Hey, quick question.", "DM should be plain text");
  assert(!user.sent[0].embeds, "DM must not use embeds");
}

async function testBlockedUserAutoCloses() {
  const thread = makeThread({ id: "thread-open" });
  const user = makeUser({
    send: async () => {
      throw dmClosedError();
    },
  });
  const client = makeClient({ users: { "user-1": user } });
  const { message, replies } = makeStaffMessage(thread, "hello?");
  const tracker = trackUpdates();

  await withStubs(
    [
      [ModDm, "findOne", () => query(openDoc())],
      [ModDm, "updateOne", tracker.stub],
      [ModmailMessageLink, "deleteMany", async () => ({})],
    ],
    () => modDm.handleModDmStaffReply(client, message)
  );

  assert(
    replies.some((r) => r.content.includes("DMs are now closed")),
    "mod should be told the user's DMs are closed"
  );
  assert(
    tracker.updates.some((u) => u.update.$set?.status === "CLOSED"),
    "conversation should auto-close"
  );
  assert(thread.archivedCalls.includes(true), "post should be archived");
}

function forumClient(extraChannels = {}) {
  return makeClient({
    channels: {
      [MOD_DM_FORUM]: {
        id: MOD_DM_FORUM,
        type: ChannelType.GuildForum,
        threads: {
          create: async () => {
            const t = makeThread();
            forumClient.created.push(t);
            return t;
          },
        },
      },
      ...extraChannels,
    },
  });
}
forumClient.created = [];

async function openWith(stubs, { target = makeUser(), client = forumClient() } = {}) {
  return withStubs(
    [
      [ModmailTicket, "findOne", async () => null],
      [ModDm, "findOne", () => query(null)],
      ...stubs,
    ],
    () =>
      modDm.openModDm(client, {
        guild: { id: "guild-1", name: "r/alevel" },
        target,
        moderator: makeUser({ id: "mod-1" }),
      })
  );
}

async function testOpenRefusals() {
  let result = await openWith([], { target: makeUser({ bot: true }) });
  assert(result.reason === "bot", "bots cannot be DMed");

  result = await openWith([
    [ModDm, "findOne", () => query({ optedOutAt: new Date(), status: "CLOSED" })],
  ]);
  assert(result.reason === "opted_out", "opted-out users cannot be DMed");

  result = await openWith([
    [ModDm, "findOne", () => query({ status: "OPEN", threadId: "t-1" })],
  ]);
  assert(result.reason === "already_open", "one open conversation per user");
  assert(result.threadId === "t-1", "should link the existing post");

  result = await openWith([
    [ModmailTicket, "findOne", async () => ({ threadId: "ticket-1" })],
  ]);
  assert(result.reason === "open_ticket", "open modmail ticket blocks /dm");
  assert(result.threadId === "ticket-1", "should link the ticket");

  const original = tryGetGuildConfig();
  const envBackup = process.env.MOD_DM_CHANNEL_ID;
  try {
    setGuildConfig({
      channels: [{ key: "modDm", channelId: MODMAIL_FORUM }],
      modmail: { forumChannelId: MODMAIL_FORUM },
    });
    result = await openWith([]);
    assert(result.reason === "clashes_with_modmail", "shared forum must be refused");

    setGuildConfig({ channels: [], modmail: { forumChannelId: MODMAIL_FORUM } });
    delete process.env.MOD_DM_CHANNEL_ID;
    result = await openWith([]);
    assert(result.reason === "not_configured", "missing forum must be reported");
  } finally {
    setGuildConfig(original);
    if (envBackup !== undefined) process.env.MOD_DM_CHANNEL_ID = envBackup;
  }
}

async function testOpenCreatesPostAndIntro() {
  forumClient.created = [];
  const target = makeUser();
  const tracker = trackUpdates();
  const claimed = openDoc({ threadId: null, session: 3 });

  const result = await openWith(
    [
      [ModDm, "findOneAndUpdate", async () => claimed],
      [ModDm, "updateOne", tracker.stub],
    ],
    { target }
  );

  assert(result.ok, "open should succeed");
  assert(result.reused === false, "first conversation creates a new post");
  assert(forumClient.created.length === 1, "one forum post should be created");
  assert(target.sent.length === 1, "user should get the intro DM");
  const intro = target.sent[0];
  assert(!intro.embeds, "intro must be plain text");
  const buttons = intro.components[0].toJSON().components.map((c) => c.custom_id);
  assert(buttons.includes("moddm_end:3"), "End button carries the session");
  assert(buttons.includes("moddm_optout"), "intro offers opt-out");
  assert(
    tracker.updates.some((u) => u.update.$set?.threadId === result.thread.id),
    "thread id should be saved"
  );
}

async function testOpenWithClosedDmsDeletesNewPost() {
  forumClient.created = [];
  const target = makeUser({
    send: async () => {
      throw dmClosedError();
    },
  });
  const tracker = trackUpdates();

  const result = await openWith(
    [
      [ModDm, "findOneAndUpdate", async () => openDoc({ threadId: null })],
      [ModDm, "updateOne", tracker.stub],
    ],
    { target }
  );

  assert(result.reason === "dms_closed", "closed DMs should be reported");
  assert(forumClient.created[0].deleted, "the new post should be deleted");
  assert(
    tracker.updates.some((u) => u.update.$set?.status === "CLOSED"),
    "the claim should be rolled back"
  );
}

async function testReopenReusesPost() {
  const oldThread = makeThread({ id: "old-thread", archived: true });
  const client = forumClient({ "old-thread": oldThread });
  forumClient.created = [];

  const result = await openWith(
    [
      [ModDm, "findOneAndUpdate", async () => openDoc({ threadId: "old-thread", session: 2 })],
      [ModDm, "updateOne", trackUpdates().stub],
    ],
    { client }
  );

  assert(result.ok && result.reused, "existing post should be reused");
  assert(forumClient.created.length === 0, "no new post should be created");
  assert(oldThread.archived === false, "reused post should be unarchived");
}

function makeButtonInteraction(customId, userId = "user-1") {
  const calls = { edits: [], followUps: [], replies: [] };
  return {
    calls,
    interaction: {
      customId,
      user: { id: userId, toString: () => `<@${userId}>` },
      deferUpdate: async () => {},
      editReply: async (p) => calls.edits.push(p),
      followUp: async (p) => calls.followUps.push(p),
      reply: async (p) => calls.replies.push(p),
      update: async (p) => calls.edits.push(p),
    },
  };
}

async function testStaleEndButtonDoesNotCloseNewConversation() {
  const tracker = trackUpdates();
  const { interaction, calls } = makeButtonInteraction("moddm_end:1");

  await withStubs(
    [
      [ModDm, "findOne", () => query(openDoc({ session: 2 }))],
      [ModDm, "updateOne", tracker.stub],
    ],
    () => modDm.handleButton(makeClient(), interaction)
  );

  assert(tracker.updates.length === 0, "stale button must not close anything");
  assert(
    calls.followUps.some((p) => p.ephemeral && p.content.includes("already ended")),
    "user should be told it already ended"
  );
}

async function testEndButtonClosesCurrentConversation() {
  const thread = makeThread({ id: "thread-open" });
  const client = makeClient({ channels: { "thread-open": thread } });
  const tracker = trackUpdates();
  const { interaction, calls } = makeButtonInteraction("moddm_end:1");

  await withStubs(
    [
      [ModDm, "findOne", () => query(openDoc({ session: 1 }))],
      [ModDm, "updateOne", tracker.stub],
      [ModmailMessageLink, "deleteMany", async () => ({})],
    ],
    () => modDm.handleButton(client, interaction)
  );

  assert(
    tracker.updates.some((u) => u.update.$set?.status === "CLOSED"),
    "End should close the conversation"
  );
  assert(
    thread.sent.some((p) => p.content.includes("ended the conversation")),
    "mods should see the user ended it"
  );
  assert(thread.archived, "post should be archived");
  assert(
    calls.followUps.some((p) => !p.ephemeral && p.content.includes("Conversation ended")),
    "user gets a confirmation"
  );
}

async function testOptOutConfirmClosesAndOffersUndo() {
  const thread = makeThread({ id: "thread-open" });
  const client = makeClient({ channels: { "thread-open": thread } });
  const tracker = trackUpdates();
  const { interaction, calls } = makeButtonInteraction("moddm_optout_confirm");

  await withStubs(
    [
      [ModDm, "findOneAndUpdate", async () => openDoc({ optedOutAt: new Date() })],
      [ModDm, "updateOne", tracker.stub],
      [ModmailMessageLink, "deleteMany", async () => ({})],
    ],
    () => modDm.handleButton(client, interaction)
  );

  assert(
    tracker.updates.some((u) => u.update.$set?.status === "CLOSED"),
    "opting out should end the open conversation"
  );
  assert(
    thread.sent.some((p) => p.content.includes("turned off moderator DMs")),
    "mods should see the opt-out"
  );
  const undo = calls.followUps.find((p) => p.components?.length);
  assert(undo, "user gets a persistent message with an undo button");
  assert(
    undo.components[0].toJSON().components[0].custom_id === "moddm_optin",
    "undo button should opt back in"
  );
}

async function testRouterPrefersModDm() {
  const client = makeClient();
  const calls = { modDm: 0, modmail: 0, tracker: 0, sticky: 0, rep: 0 };
  let claim = true;

  messageRouter(client, {
    handleMessageTracker: async () => calls.tracker++,
    handleSticky: async () => calls.sticky++,
    handleReputation: async () => calls.rep++,
    handleModmailDm: async () => calls.modmail++,
    handleModmailStaffReply: async () => false,
    handleModDmUserMessage: async () => {
      calls.modDm++;
      return claim;
    },
    handleModDmStaffReply: async () => true,
  });

  const [listener] = client.listeners.get(Events.MessageCreate);
  const dm = makeDmMessage("user-1").message;

  await listener(dm);
  assert(calls.modDm === 1 && calls.modmail === 0, "open mod DM must bypass modmail");

  claim = false;
  await listener({ ...dm, id: id("dm") });
  assert(calls.modmail === 1, "without a mod DM the message goes to modmail");

  await listener(makeStaffMessage(makeThread(), "hi").message);
  assert(
    calls.tracker === 0 && calls.sticky === 0 && calls.rep === 0,
    "mod DM forum messages must skip XP/sticky/rep"
  );
}

async function testModmailIntakeBlockedDuringModDm() {
  const client = makeClient();
  modmailSystem(client);
  const [listener] = client.listeners.get(Events.InteractionCreate);
  const replies = [];
  let modalShown = false;

  await withStubs(
    [
      [ModmailBan, "findOne", () => query(null)],
      [ModmailTicket, "findOne", async () => null],
      [ModDm, "exists", async () => ({ _id: "doc-1" })],
    ],
    () =>
      listener({
        isStringSelectMenu: () => true,
        isModalSubmit: () => false,
        customId: "modmail_category",
        values: ["general"],
        user: { id: "user-1" },
        reply: async (p) => replies.push(p),
        showModal: async () => {
          modalShown = true;
        },
      })
  );

  assert(!modalShown, "ticket intake must not open during a mod DM");
  assert(
    replies.some((r) => r.content.includes("talking with the moderators")),
    "user should be told to end the mod DM first"
  );
}

async function main() {
  const original = tryGetGuildConfig();
  setGuildConfig({
    ...(original || {}),
    channels: [{ key: "modDm", channelId: MOD_DM_FORUM }],
    modmail: { forumChannelId: MODMAIL_FORUM },
  });

  try {
    testSplitMessageContent();
    testPlainTextKeepsFormatting();
    await testSendPlainRelayDisablesMentionsAndSplits();
    await testUserDmWithoutOpenConversationFallsThrough();
    await testUserDmRelaysToThread();
    await testUserDmWithDeletedPostEndsConversation();
    await testStaffNoteIsNotRelayed();
    await testStaffReplyInClosedConversationWarns();
    await testStaffReplyDelivers();
    await testBlockedUserAutoCloses();
    await testOpenRefusals();
    await testOpenCreatesPostAndIntro();
    await testOpenWithClosedDmsDeletesNewPost();
    await testReopenReusesPost();
    await testStaleEndButtonDoesNotCloseNewConversation();
    await testEndButtonClosesCurrentConversation();
    await testOptOutConfirmClosesAndOffersUndo();
    await testRouterPrefersModDm();
    await testModmailIntakeBlockedDuringModDm();
  } finally {
    setGuildConfig(original);
  }

  console.log("verify-mod-dm: all checks passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
