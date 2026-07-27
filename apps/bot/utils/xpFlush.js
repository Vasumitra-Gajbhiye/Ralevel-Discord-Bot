const { connectDB, User, XpBan, XpFlushGrant } = require("@ralevel/db");
const redis = require("../redis");
const handleRanks = require("../systems/rankSystem");
const { tryGetGuildConfig } = require("./guildConfigStore");
const { getISTDateInfo } = require("./qotdHelpers");
const {
  PENDING_KEY_TTL_SEC,
  FLUSH_LOCK_TTL_SEC,
  getPendingKey,
  getBoosterKey,
  getDrainingKey,
  getDrainingBoostersKey,
  getFlushLockKey,
} = require("./xpKeys");

function generateFlushId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function renameIfExists(fromKey, toKey) {
  try {
    await redis.rename(fromKey, toKey);
    return true;
  } catch (err) {
    const message = String(err?.message || err);
    if (message.includes("no such key") || message.includes("ERR no such key")) {
      return false;
    }
    throw err;
  }
}

function buildGrantDocs({
  guildId,
  flushId,
  counts,
  boosters,
  bannedUserIds,
  dateIst,
  boosterMultiplier,
}) {
  const docs = [];
  const grantMeta = [];

  for (const [userId, rawCount] of Object.entries(counts)) {
    if (bannedUserIds.has(userId)) continue;

    const messages = parseInt(rawCount || "0", 10);
    if (!Number.isFinite(messages) || messages <= 0) continue;

    const isBooster =
      boosters[userId] === "true" || boosters[userId] === true;
    const xp = isBooster ? messages * boosterMultiplier : messages;

    docs.push({
      guildId,
      flushId,
      userId,
      messages,
      xp,
      dateIst,
      applied: false,
    });
    grantMeta.push({ userId, messages, xp });
  }

  return { docs, grantMeta };
}

async function insertNewGrants(docs) {
  if (docs.length === 0) return new Set();

  const insertedUserIds = new Set();

  try {
    const inserted = await XpFlushGrant.insertMany(docs, { ordered: false });
    for (const doc of inserted) {
      insertedUserIds.add(doc.userId);
    }
  } catch (err) {
    const isBulkDuplicate =
      err?.code === 11000 ||
      err?.name === "MongoBulkWriteError" ||
      Array.isArray(err?.writeErrors);

    if (!isBulkDuplicate) throw err;

    if (Array.isArray(err.insertedDocs)) {
      for (const doc of err.insertedDocs) {
        insertedUserIds.add(doc.userId);
      }
    } else if (err.result?.insertedIds) {
      const ids = err.result.insertedIds;
      for (const index of Object.keys(ids)) {
        const doc = docs[Number(index)];
        if (doc) insertedUserIds.add(doc.userId);
      }
    } else {
      // Fallback: see which grants exist for this flush (duplicates already there)
      const flushId = docs[0]?.flushId;
      const guildId = docs[0]?.guildId;
      const existing = await XpFlushGrant.find({
        guildId,
        flushId,
      })
        .select("userId")
        .lean();
      const existingIds = new Set(existing.map((g) => g.userId));
      for (const doc of docs) {
        if (!existingIds.has(doc.userId)) {
          // Should not happen often; try single create
          try {
            await XpFlushGrant.create(doc);
            insertedUserIds.add(doc.userId);
          } catch (createErr) {
            if (createErr?.code !== 11000) throw createErr;
          }
        }
      }
    }
  }

  return insertedUserIds;
}

async function applyGrantsToUsers({
  client,
  guildId,
  flushId,
  grantMeta,
  insertedUserIds,
}) {
  const toApply = grantMeta.filter((g) => insertedUserIds.has(g.userId));
  if (toApply.length === 0) return;

  const userIds = toApply.map((g) => g.userId);
  const existingUsers = await User.find({ _id: { $in: userIds } })
    .select("_id xp appliedFlushIds")
    .lean();
  const previousXpByUser = new Map(
    existingUsers.map((u) => [String(u._id), u.xp || 0])
  );
  const alreadyApplied = new Set(
    existingUsers
      .filter((u) => Array.isArray(u.appliedFlushIds) && u.appliedFlushIds.includes(flushId))
      .map((u) => String(u._id))
  );

  const operations = [];
  const usersForRanking = [];

  for (const grant of toApply) {
    if (alreadyApplied.has(grant.userId)) continue;

    const previousXp = previousXpByUser.get(grant.userId) || 0;
    usersForRanking.push({
      userId: grant.userId,
      previousXp,
      xp: previousXp + grant.xp,
    });
    operations.push({
      updateOne: {
        filter: {
          _id: grant.userId,
          appliedFlushIds: { $nin: [flushId] },
        },
        update: {
          $inc: {
            total_messages: grant.messages,
            xp: grant.xp,
          },
          $set: { guild_id: guildId },
          $push: {
            appliedFlushIds: {
              $each: [flushId],
              $slice: -48,
            },
          },
        },
        upsert: true,
      },
    });
  }

  if (operations.length > 0) {
    await User.bulkWrite(operations, { ordered: false });
  }

  if (client && usersForRanking.length > 0) {
    await handleRanks(client, guildId, usersForRanking, { announce: true });
  }
}

async function processDrainingFlush(client, guildId, flushId) {
  const countKey = getDrainingKey(guildId, flushId);
  const boosterKey = getDrainingBoostersKey(guildId, flushId);

  const existingGrants = await XpFlushGrant.find({ guildId, flushId }).lean();
  if (existingGrants.length > 0) {
    const grantMeta = existingGrants.map((g) => ({
      userId: g.userId,
      messages: g.messages,
      xp: g.xp,
    }));
    const insertedUserIds = new Set(grantMeta.map((g) => g.userId));
    // Re-apply is safe: User.appliedFlushIds makes $inc idempotent per flushId
    await applyGrantsToUsers({
      client,
      guildId,
      flushId,
      grantMeta,
      insertedUserIds,
    });
    await XpFlushGrant.updateMany(
      { guildId, flushId },
      { $set: { applied: true } }
    );
    await redis.del(countKey, boosterKey);
    console.log(
      `[xpFlush] flushId=${flushId} resumed ledger grants=${existingGrants.length}`
    );
    return {
      skipped: false,
      users: existingGrants.length,
      granted: existingGrants.length,
      resumed: true,
    };
  }

  const [counts, boosters] = await Promise.all([
    redis.hgetall(countKey),
    redis.hgetall(boosterKey),
  ]);

  if (!counts || Object.keys(counts).length === 0) {
    await redis.del(countKey, boosterKey);
    return { skipped: true, users: 0, granted: 0 };
  }

  const userIds = Object.keys(counts);
  const xpBans = await XpBan.find({ userId: { $in: userIds } })
    .select("userId")
    .lean();
  const bannedUserIds = new Set(xpBans.map((ban) => ban.userId));

  const boosterMultiplier =
    tryGetGuildConfig()?.ranks?.boosterMultiplier ?? 2;
  const dateIst = getISTDateInfo().dateStr;

  const { docs, grantMeta } = buildGrantDocs({
    guildId,
    flushId,
    counts,
    boosters: boosters || {},
    bannedUserIds,
    dateIst,
    boosterMultiplier,
  });

  if (docs.length === 0) {
    await redis.del(countKey, boosterKey);
    return { skipped: true, users: 0, granted: 0 };
  }

  const insertedUserIds = await insertNewGrants(docs);
  await applyGrantsToUsers({
    client,
    guildId,
    flushId,
    grantMeta,
    insertedUserIds,
  });
  await XpFlushGrant.updateMany(
    { guildId, flushId, userId: { $in: [...insertedUserIds] } },
    { $set: { applied: true } }
  );

  await redis.del(countKey, boosterKey);

  console.log(
    `[xpFlush] flushId=${flushId} users=${docs.length} granted=${insertedUserIds.size}`
  );

  return {
    skipped: false,
    users: docs.length,
    granted: insertedUserIds.size,
  };
}

async function drainPendingToFlushId(guildId, flushId) {
  const pendingKey = getPendingKey(guildId);
  const boosterKey = getBoosterKey(guildId);
  const drainingKey = getDrainingKey(guildId, flushId);
  const drainingBoostersKey = getDrainingBoostersKey(guildId, flushId);

  const renamedCounts = await renameIfExists(pendingKey, drainingKey);
  await renameIfExists(boosterKey, drainingBoostersKey);

  return renamedCounts;
}

async function flushPendingXp(client, options = {}) {
  const { acquireLock = true } = options;
  const guildId = process.env.GUILD_ID;
  if (!guildId) {
    console.error("[xpFlush] GUILD_ID is required");
    return null;
  }

  const lockKey = getFlushLockKey(guildId);
  if (acquireLock) {
    const acquired = await redis.set(
      lockKey,
      "1",
      "EX",
      FLUSH_LOCK_TTL_SEC,
      "NX"
    );
    if (!acquired) {
      return { locked: true };
    }
  }

  try {
    await connectDB();
    const flushId = generateFlushId();
    const renamed = await drainPendingToFlushId(guildId, flushId);
    if (!renamed) {
      return { empty: true, flushId };
    }

    return await processDrainingFlush(client, guildId, flushId);
  } finally {
    if (acquireLock) {
      await redis.del(lockKey);
    }
  }
}

async function listOrphanFlushIds(guildId) {
  const stream = redis.scanStream({
    match: `xp:draining:${guildId}:*`,
    count: 100,
  });

  const flushIds = new Set();

  await new Promise((resolve, reject) => {
    stream.on("data", (keys) => {
      for (const key of keys) {
        if (key.includes(":draining-boosters:")) continue;
        const prefix = `xp:draining:${guildId}:`;
        if (!key.startsWith(prefix)) continue;
        const flushId = key.slice(prefix.length);
        if (flushId) flushIds.add(flushId);
      }
    });
    stream.on("end", resolve);
    stream.on("error", reject);
  });

  return [...flushIds];
}

async function resumeOrphanDrains(client) {
  const guildId = process.env.GUILD_ID;
  if (!guildId) return { resumed: 0 };

  await connectDB();

  const lockKey = getFlushLockKey(guildId);
  const acquired = await redis.set(
    lockKey,
    "1",
    "EX",
    FLUSH_LOCK_TTL_SEC,
    "NX"
  );
  if (!acquired) {
    return { locked: true, resumed: 0 };
  }

  try {
    const flushIds = await listOrphanFlushIds(guildId);
    let resumed = 0;
    for (const flushId of flushIds) {
      await processDrainingFlush(client, guildId, flushId);
      resumed += 1;
    }
    if (resumed > 0) {
      console.log(`[xpFlush] resumed ${resumed} orphan drain(s)`);
    }
    return { resumed };
  } finally {
    await redis.del(lockKey);
  }
}

async function getPendingXpOverlay(guildId, userId) {
  try {
    const [rawCount, rawBooster] = await Promise.all([
      redis.hget(getPendingKey(guildId), userId),
      redis.hget(getBoosterKey(guildId), userId),
    ]);

    const messages = parseInt(rawCount || "0", 10) || 0;
    if (messages <= 0) {
      return { messages: 0, xp: 0 };
    }

    const isBooster = rawBooster === "true";
    const boosterMultiplier =
      tryGetGuildConfig()?.ranks?.boosterMultiplier ?? 2;
    const xp = isBooster ? messages * boosterMultiplier : messages;

    return { messages, xp };
  } catch (err) {
    console.error("[xpFlush] pending overlay unavailable:", err.message || err);
    return { messages: 0, xp: 0 };
  }
}

module.exports = {
  flushPendingXp,
  resumeOrphanDrains,
  processDrainingFlush,
  buildGrantDocs,
  insertNewGrants,
  getPendingXpOverlay,
  getPendingKey,
  getBoosterKey,
  getDrainingKey,
  getDrainingBoostersKey,
  getFlushLockKey,
  generateFlushId,
  renameIfExists,
  drainPendingToFlushId,
  PENDING_KEY_TTL_SEC,
  FLUSH_LOCK_TTL_SEC,
};
