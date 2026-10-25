const {
  ApplicationFlags,
  GatewayIntentBits,
  IntentsBitField,
} = require("discord.js");
const intents = require("../utils/privilegedIntents");
const modmail = require("../systems/modmail");
const purge = require("../commands/moderation/purge");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const BOT_ID = "999";

function mockClient(intentList) {
  return {
    options: { intents: new IntentsBitField(intentList) },
    user: { id: BOT_ID },
  };
}

const RESTRICTED = mockClient([
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.DirectMessages,
]);
const PRIVILEGED = mockClient([
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.DirectMessages,
  GatewayIntentBits.GuildMembers,
  GatewayIntentBits.MessageContent,
]);

async function withMutedWarnings(fn) {
  const original = console.warn;
  console.warn = () => {};
  try {
    return await fn();
  } finally {
    console.warn = original;
  }
}

async function testGetMode() {
  assert(intents.getMode(undefined) === "auto", "unset should default to auto");
  assert(intents.getMode("") === "auto", "empty should default to auto");
  assert(intents.getMode(" FALSE ") === "false", "should normalise case/space");
  assert(intents.getMode("true") === "true", "true should be accepted");
  await withMutedWarnings(() => {
    assert(intents.getMode("yes") === "auto", "unknown should fall back to auto");
  });
}

function testGrantedFromFlags() {
  const none = intents.grantedFromFlags(0);
  assert(!none.members && !none.messageContent, "no flags should grant nothing");

  const limited = intents.grantedFromFlags(
    ApplicationFlags.GatewayGuildMembersLimited |
      ApplicationFlags.GatewayMessageContentLimited
  );
  assert(limited.members && limited.messageContent, "limited flags should grant");

  const contentOnly = intents.grantedFromFlags(ApplicationFlags.GatewayMessageContent);
  assert(
    !contentOnly.members && contentOnly.messageContent,
    "intents should be granted independently"
  );
}

async function testResolveIntents() {
  const forcedOff = await intents.resolveIntents({ mode: "false" });
  assert(
    !forcedOff.intents.includes(GatewayIntentBits.MessageContent) &&
      !forcedOff.intents.includes(GatewayIntentBits.GuildMembers),
    "false should request no privileged intents"
  );
  assert(
    forcedOff.intents.includes(GatewayIntentBits.Guilds),
    "base intents should always be requested"
  );

  const forcedOn = await intents.resolveIntents({ mode: "true" });
  assert(
    forcedOn.intents.includes(GatewayIntentBits.MessageContent) &&
      forcedOn.intents.includes(GatewayIntentBits.GuildMembers),
    "true should request both privileged intents"
  );

  const auto = await intents.resolveIntents({
    mode: "auto",
    fetchFlags: async () => ApplicationFlags.GatewayGuildMembersLimited,
  });
  assert(
    auto.granted.members && !auto.granted.messageContent,
    "auto should follow application flags"
  );

  const failed = await withMutedWarnings(() =>
    intents.resolveIntents({
      mode: "auto",
      fetchFlags: async () => {
        throw new Error("network down");
      },
    })
  );
  assert(
    !failed.granted.members && !failed.granted.messageContent,
    "auto lookup failure should fall back to no privileged intents"
  );
}

function testDescribeAndErrors() {
  const summary = intents.describeIntents({
    mode: "auto",
    granted: { members: false, messageContent: false },
  });
  assert(summary.includes("degraded"), "restricted summary should list degraded features");
  assert(
    !intents
      .describeIntents({ mode: "true", granted: { members: true, messageContent: true } })
      .includes("degraded"),
    "full summary should not mention degraded"
  );

  assert(intents.isDisallowedIntentsError({ code: 4014 }), "4014 code should match");
  assert(
    intents.isDisallowedIntentsError(new Error("Used disallowed intents")),
    "discord.js message should match"
  );
  assert(!intents.isDisallowedIntentsError(new Error("Invalid token")), "other errors should not match");
}

function testClientIntentChecks() {
  assert(!intents.hasMessageContent(RESTRICTED), "restricted client lacks content");
  assert(!intents.hasGuildMembers(RESTRICTED), "restricted client lacks members");
  assert(intents.hasMessageContent(PRIVILEGED), "privileged client has content");
  assert(intents.hasMessageContent({}), "unknown clients should be treated as privileged");
}

function testMessageText() {
  const client = { user: { id: BOT_ID } };
  assert(
    modmail.messageText({ client, content: `<@${BOT_ID}> hello there` }) === "hello there",
    "should strip a leading bot mention"
  );
  assert(
    modmail.messageText({ client, content: `hi <@!${BOT_ID}>` }) === "hi",
    "should strip nickname-style bot mentions"
  );
  assert(
    modmail.messageText({ client, content: "<@123> hello" }) === "<@123> hello",
    "should keep other users' mentions"
  );
  assert(
    !modmail.hasRelayableContent({ client, content: `<@${BOT_ID}>` }),
    "a bare bot mention should not be relayable"
  );
}

function mockThreadMessage(channelId, replies) {
  return {
    channel: { id: channelId },
    reply: async (payload) => {
      replies.push(payload);
    },
  };
}

async function testContentWarning() {
  const replies = [];
  await modmail.warnIfContentUnavailable(PRIVILEGED, mockThreadMessage("t-1", replies));
  assert(replies.length === 0, "should not warn when content is available");

  await modmail.warnIfContentUnavailable(RESTRICTED, mockThreadMessage("t-2", replies));
  assert(replies.length === 1, "should warn when content is unavailable");
  assert(
    replies[0].content.includes(`<@${BOT_ID}>`),
    "warning should tell staff to mention the bot"
  );
  assert(
    replies[0].allowedMentions?.parse?.length === 0,
    "warning must not ping anyone"
  );

  await modmail.warnIfContentUnavailable(RESTRICTED, mockThreadMessage("t-2", replies));
  assert(replies.length === 1, "warning should be throttled per thread");
}

function mockPurgeInteraction(client, filter) {
  const replies = [];
  let fetched = false;
  const values = { amount: 10, filter, reason: "test" };
  return {
    replies,
    wasFetched: () => fetched,
    interaction: {
      client,
      options: {
        getChannel: () => ({
          messages: {
            fetch: async () => {
              fetched = true;
              return new Map();
            },
          },
        }),
        getInteger: (name) => values[name] ?? null,
        getString: (name) => values[name] ?? null,
        getUser: () => null,
      },
      reply: async (payload) => {
        replies.push(payload);
      },
    },
  };
}

async function testPurgeContentFilters() {
  for (const filter of ["keyword", "links", "attachments", "embeds", "images"]) {
    const mock = mockPurgeInteraction(RESTRICTED, filter);
    await purge.execute(mock.interaction);
    assert(!mock.wasFetched(), `${filter} should not fetch messages when restricted`);
    assert(
      mock.replies[0]?.ephemeral && mock.replies[0].content.includes("Message Content"),
      `${filter} should reply with a clean ephemeral error`
    );
  }
}

async function main() {
  await testGetMode();
  testGrantedFromFlags();
  await testResolveIntents();
  testDescribeAndErrors();
  testClientIntentChecks();
  testMessageText();
  await testContentWarning();
  await testPurgeContentFilters();

  console.log("verify-privileged-intents: all checks passed");
}

main().catch((err) => {
  console.error("verify-privileged-intents failed:", err.message);
  process.exit(1);
});
