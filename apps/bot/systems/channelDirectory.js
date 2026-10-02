/**
 * Publishes the guild's channel list to Mongo (ChannelDirectory) so the
 * dashboard can offer real channel pickers, e.g. on Settings → Exam subjects.
 * Written on ready, then again a few seconds after channels are created,
 * edited or deleted. Threads are left out.
 */
const { ChannelType, Events } = require("discord.js");
const { ChannelDirectory } = require("@ralevel/db");

const PUBLISH_DEBOUNCE_MS = 5000;

const TYPE_NAMES = {
  [ChannelType.GuildText]: "text",
  [ChannelType.GuildAnnouncement]: "announcement",
  [ChannelType.GuildForum]: "forum",
  [ChannelType.GuildMedia]: "media",
  [ChannelType.GuildVoice]: "voice",
  [ChannelType.GuildStageVoice]: "stage",
  [ChannelType.GuildCategory]: "category",
};

/** Guild channel cache → directory entries, sorted by ID so unchanged lists compare equal. */
function buildDirectoryChannels(channels) {
  const entries = [];
  for (const channel of channels.values()) {
    const type = TYPE_NAMES[channel.type];
    if (!type) continue;
    entries.push({
      id: channel.id,
      name: channel.name,
      type,
      parentId: channel.parentId ?? null,
      position: channel.rawPosition ?? 0,
    });
  }
  return entries.sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
}

function channelDirectorySystem(client, { debounceMs = PUBLISH_DEBOUNCE_MS } = {}) {
  const guildId = process.env.GUILD_ID;
  let timer = null;
  let publishing = false;
  let rerun = false;
  let lastPublished = null;

  async function publish() {
    if (publishing) {
      rerun = true;
      return;
    }
    publishing = true;
    try {
      const guild = client.guilds.cache.get(guildId);
      if (!guild) {
        console.warn(`[ChannelDirectory] Skip: bot is not in guild ${guildId}.`);
        return;
      }
      const channels = buildDirectoryChannels(guild.channels.cache);
      const serialized = JSON.stringify(channels);
      if (serialized === lastPublished) return;

      await ChannelDirectory.updateOne(
        { guildId },
        { $set: { channels } },
        { upsert: true },
      );
      lastPublished = serialized;
    } catch (err) {
      console.error("[ChannelDirectory] Failed to publish channel list:", err);
    } finally {
      publishing = false;
      if (rerun) {
        rerun = false;
        schedulePublish();
      }
    }
  }

  function schedulePublish() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      publish();
    }, debounceMs);
  }

  function onChannelChange(channel) {
    if (channel?.guildId !== guildId || channel.isThread?.()) return;
    schedulePublish();
  }

  if (!guildId) {
    console.warn("[ChannelDirectory] Disabled: GUILD_ID is not set.");
    return { publish };
  }

  client.once("ready", () => {
    publish();
  });
  client.on(Events.ChannelCreate, onChannelChange);
  client.on(Events.ChannelUpdate, (_oldChannel, channel) => onChannelChange(channel));
  client.on(Events.ChannelDelete, onChannelChange);

  return { publish };
}

module.exports = channelDirectorySystem;
module.exports.buildDirectoryChannels = buildDirectoryChannels;
module.exports.PUBLISH_DEBOUNCE_MS = PUBLISH_DEBOUNCE_MS;
