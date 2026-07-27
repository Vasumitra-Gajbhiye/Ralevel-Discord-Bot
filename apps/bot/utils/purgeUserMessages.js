const BULK_DELETE_DELAY_MS = 1000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MANAGE_MESSAGES_PERMISSION = 1n << 13n;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveChannels(guild, categoryId) {
  const channels = guild.channels.cache.filter((channel) => {
    if (!channel.isTextBased()) return false;
    if (categoryId) return channel.parentId === categoryId;
    return true;
  });

  return [...channels.values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

async function deleteMatchingMessages(channel, matches) {
  let deleted = 0;

  for (let i = 0; i < matches.length; i += 100) {
    const batch = matches.slice(i, i + 100);
    try {
      const removed = await channel.bulkDelete(batch, true);
      deleted += removed.size;
    } catch (err) {
      throw new Error(
        `#${channel.name}: ${err.message || "bulk delete failed"}`,
      );
    }

    if (i + 100 < matches.length) {
      await sleep(BULK_DELETE_DELAY_MS);
    }
  }

  return deleted;
}

async function purgeChannelMessages({ channel, userId, cutoff, botMember }) {
  const permissions = channel.permissionsFor(botMember);
  if (!permissions?.has(MANAGE_MESSAGES_PERMISSION)) {
    return { deleted: 0, skipped: true };
  }

  const matches = [];
  let before;
  let reachedCutoff = false;

  while (!reachedCutoff) {
    const fetchOptions = { limit: 100 };
    if (before) fetchOptions.before = before;

    const batch = await channel.messages.fetch(fetchOptions);
    if (batch.size === 0) break;

    const ordered = [...batch.values()].sort(
      (a, b) => b.createdTimestamp - a.createdTimestamp,
    );

    for (const message of ordered) {
      if (message.createdTimestamp < cutoff) {
        reachedCutoff = true;
        break;
      }

      if (message.author.id === userId) {
        matches.push(message);
      }
    }

    const oldestInBatch = ordered[ordered.length - 1];
    if (!oldestInBatch || oldestInBatch.createdTimestamp < cutoff) {
      reachedCutoff = true;
    }

    before = oldestInBatch?.id;
    if (batch.size < 100) break;
  }

  if (matches.length === 0) {
    return { deleted: 0, skipped: false };
  }

  const deleted = await deleteMatchingMessages(channel, matches);
  return { deleted, skipped: false };
}

async function purgeUserMessages({
  guild,
  userId,
  days,
  categoryId = null,
  onProgress,
}) {
  const cutoff = Date.now() - days * MS_PER_DAY;
  const botMember = guild.members.me;
  const channels = resolveChannels(guild, categoryId);

  let totalDeleted = 0;
  let channelsScanned = 0;
  let channelsSkipped = 0;
  const errors = [];

  for (let index = 0; index < channels.length; index++) {
    const channel = channels[index];

    try {
      const result = await purgeChannelMessages({
        channel,
        userId,
        cutoff,
        botMember,
      });

      if (result.skipped) {
        channelsSkipped += 1;
      } else {
        channelsScanned += 1;
        totalDeleted += result.deleted;
      }

      if (onProgress) {
        await onProgress({
          channel,
          deletedInChannel: result.deleted,
          totalDeleted,
          channelsDone: index + 1,
          channelsTotal: channels.length,
          channelsScanned,
          channelsSkipped,
        });
      }
    } catch (err) {
      errors.push(err.message || String(err));
      channelsScanned += 1;

      if (onProgress) {
        await onProgress({
          channel,
          deletedInChannel: 0,
          totalDeleted,
          channelsDone: index + 1,
          channelsTotal: channels.length,
          channelsScanned,
          channelsSkipped,
          error: err.message || String(err),
        });
      }
    }
  }

  return {
    deleted: totalDeleted,
    channelsScanned,
    channelsSkipped,
    channelsTotal: channels.length,
    errors,
  };
}

module.exports = {
  BULK_DELETE_DELAY_MS,
  MS_PER_DAY,
  MANAGE_MESSAGES_PERMISSION,
  resolveChannels,
  purgeUserMessages,
};
