const { Sticky } = require("@ralevel/db");

const DEFAULT_LINE_THRESHOLD = 8; // repost after 8 lines
const FLUSH_DEBOUNCE_MS = 5000;

const pendingLastMessageIds = new Map();
let flushTimer = null;

function toCacheEntry(doc) {
  return {
    channelId: doc.channelId,
    content: doc.content,
    lineThreshold: doc.lineThreshold,
    lastMessageId: doc.lastMessageId,
    enabled: doc.enabled,
  };
}

function upsertStickyCache(client, doc) {
  if (!client.stickies) return;
  client.stickies.set(doc.channelId, toCacheEntry(doc));
}

function removeStickyCache(client, channelId) {
  client.stickies?.delete(channelId);
  pendingLastMessageIds.delete(channelId);
}

async function flushPendingLastMessageIds() {
  flushTimer = null;
  if (!pendingLastMessageIds.size) return;

  const entries = [...pendingLastMessageIds.entries()];
  pendingLastMessageIds.clear();

  await Promise.all(
    entries.map(([channelId, lastMessageId]) =>
      Sticky.updateOne({ channelId }, { lastMessageId }).catch((err) => {
        console.error(`Sticky flush error for ${channelId}:`, err);
      })
    )
  );
}

function scheduleLastMessageIdFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushPendingLastMessageIds().catch((err) => {
      console.error("Sticky flush error:", err);
    });
  }, FLUSH_DEBOUNCE_MS);
}

function queueLastMessageIdFlush(channelId, lastMessageId) {
  pendingLastMessageIds.set(channelId, lastMessageId);
  scheduleLastMessageIdFlush();
}

async function loadStickyCache(client) {
  const stickies = await Sticky.find({ enabled: true }).lean();
  client.stickies.clear();
  for (const sticky of stickies) {
    client.stickies.set(sticky.channelId, toCacheEntry(sticky));
  }
  console.log(`Loaded ${stickies.length} stickies into cache`);
}

function stickySystem(client) {
  client.stickies = new Map();
  const stickyState = new Map();

  client.once("ready", () => {
    loadStickyCache(client).catch((err) => {
      console.error("Failed to load sticky cache:", err);
    });
  });

  async function handleStickyMessage(message) {
    try {
      const sticky = client.stickies.get(message.channel.id);
      if (!sticky) return;

      const lineThreshold =
        Number.isInteger(sticky.lineThreshold) && sticky.lineThreshold > 0
          ? sticky.lineThreshold
          : DEFAULT_LINE_THRESHOLD;

      if (message.id === sticky.lastMessageId) return;

      let state = stickyState.get(message.channel.id);
      if (!state) {
        state = { lineCount: 0 };
        stickyState.set(message.channel.id, state);
      }

      const linesAdded = message.content?.split("\n").length || 1;
      state.lineCount += linesAdded;

      if (state.lineCount < lineThreshold) return;

      state.lineCount = 0;

      if (sticky.lastMessageId) {
        try {
          await message.channel.messages.delete(sticky.lastMessageId);
        } catch {}
      }

      const formatted = `__**Stickied Message:**__\n\n${sticky.content}`;

      const sent = await message.channel.send({
        content: formatted,
        allowedMentions: { parse: [] },
      });

      sticky.lastMessageId = sent.id;
      client.stickies.set(message.channel.id, sticky);
      queueLastMessageIdFlush(message.channel.id, sent.id);
    } catch (err) {
      console.error("[Sticky] Message Handler Error:", err);
    }
  }

  const flushOnExit = () => {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    flushPendingLastMessageIds().catch((err) => {
      console.error("Sticky flush on exit error:", err);
    });
  };

  process.once("SIGINT", flushOnExit);
  process.once("SIGTERM", flushOnExit);

  return handleStickyMessage;
}

module.exports = stickySystem;
module.exports.upsertStickyCache = upsertStickyCache;
module.exports.removeStickyCache = removeStickyCache;
