const { ModmailBan, ModmailTicket, ModmailMessageLink } = require("@ralevel/db");
const modmailSystem = require("../systems/modmail");
const unbanCommand = require("../commands/modmail/unban-user-modmail");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

let nextId = 1;

function makeDm(userId) {
  const sent = [];
  return {
    sent,
    message: {
      id: `dm-${nextId++}`,
      author: { id: userId, bot: false },
      guild: null,
      content: "hello",
      attachments: new Map(),
      stickers: new Map(),
      channel: { send: async (payload) => sent.push(payload) },
    },
  };
}

function makeClient(fetched) {
  return {
    on: () => {},
    channels: {
      fetch: async (id) => {
        fetched.push(id);
        return { id, archived: false, send: async () => ({ id: "x" }), setArchived: async () => {} };
      },
    },
  };
}

async function withStubs(stubs, fn) {
  const originals = [];
  for (const [target, key, value] of stubs) {
    originals.push([target, key, target[key]]);
    target[key] = value;
  }
  try {
    await fn();
  } finally {
    for (const [target, key, value] of originals) target[key] = value;
  }
}

function lean(value) {
  return { lean: async () => value };
}

async function testBannedNoTicket() {
  const { message, sent } = makeDm("u1");
  const fetched = [];
  await withStubs(
    [
      [ModmailBan, "findOne", () => lean({ reason: "spam" })],
      [ModmailTicket, "findOne", async () => null],
    ],
    () => modmailSystem(makeClient(fetched)).handleModmailDm(message)
  );
  assert(sent.length === 1, "banned user should get exactly one reply");
  assert(!sent[0].components, "banned user must not get the category menu");
  const embed = sent[0].embeds[0].toJSON();
  assert(embed.title === "Banned from Modmail", "should send ban embed");
  assert(
    embed.description.includes("DM any server admin to request an unban"),
    "ban embed should explain how to request an unban"
  );
}

async function testBannedStaleTicket() {
  const { message, sent } = makeDm("u2");
  const fetched = [];
  const updates = [];
  const ticket = { _id: "t1", threadId: "thread-1", userId: "u2" };
  await withStubs(
    [
      [ModmailBan, "findOne", () => lean({ reason: "abuse" })],
      [ModmailTicket, "findOne", async () => ticket],
      [ModmailTicket, "updateOne", async (...args) => updates.push(args)],
      [ModmailMessageLink, "deleteMany", async () => ({})],
    ],
    () => modmailSystem(makeClient(fetched)).handleModmailDm(message)
  );
  assert(sent.length === 1, "should reply once");
  assert(
    sent[0].embeds[0].toJSON().title === "Banned from Modmail",
    "should reply with ban embed, not relay"
  );
  assert(
    updates.length === 1 && updates[0][1].$set.status === "CLOSED",
    "stale ticket should be closed"
  );
}

async function testNotBannedGetsMenu() {
  const { message, sent } = makeDm("u3");
  await withStubs(
    [
      [ModmailBan, "findOne", () => lean(null)],
      [ModmailTicket, "findOne", async () => null],
    ],
    () => modmailSystem(makeClient([])).handleModmailDm(message)
  );
  assert(sent.length === 1 && sent[0].components, "non-banned user should get the menu");
}

function testUnbanEmbed() {
  const embed = modmailSystem.buildUnbannedFromModmailEmbed().toJSON();
  assert(embed.title === "Unbanned from Modmail", "unban embed title");
  assert(embed.description.includes("use modmail again"), "unban embed text");
}

function makeInteraction(sendImpl) {
  const replies = [];
  const target = { id: "u9", toString: () => "<@u9>", send: sendImpl };
  return {
    replies,
    interaction: {
      options: { getUser: () => target },
      reply: async (payload) => replies.push(payload),
    },
  };
}

async function testUnbanCommand() {
  const dms = [];
  let run = makeInteraction(async (p) => dms.push(p));
  await withStubs([[ModmailBan, "deleteOne", async () => ({ deletedCount: 1 })]], () =>
    unbanCommand.execute(run.interaction)
  );
  assert(dms.length === 1, "unban should DM the user");
  assert(!run.replies[0].content.includes("couldn't DM"), "no DM warning on success");

  run = makeInteraction(async () => {
    throw new Error("DMs closed");
  });
  await withStubs([[ModmailBan, "deleteOne", async () => ({ deletedCount: 1 })]], () =>
    unbanCommand.execute(run.interaction)
  );
  assert(run.replies[0].content.includes("couldn't DM"), "DM failure should be reported");

  const dms2 = [];
  run = makeInteraction(async (p) => dms2.push(p));
  await withStubs([[ModmailBan, "deleteOne", async () => ({ deletedCount: 0 })]], () =>
    unbanCommand.execute(run.interaction)
  );
  assert(dms2.length === 0, "not-banned user should not be DMed");
}

async function main() {
  await testBannedNoTicket();
  await testBannedStaleTicket();
  await testNotBannedGetsMenu();
  testUnbanEmbed();
  await testUnbanCommand();
  console.log("verify-modmail-ban: all checks passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
