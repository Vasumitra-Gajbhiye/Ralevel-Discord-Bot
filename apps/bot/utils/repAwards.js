// utils/repAwards.js
//--------------------------------------------------
// Reputation awards shared by thank-you detection (systems/reputation.js)
// and the "Give Rep" context menu.
//--------------------------------------------------
const { Reputation, RepBan, RepGrant } = require("@ralevel/db");

const { PermissionsBitField } = require("discord.js");
const { getGuildConfig, getRoleId } = require("./guildConfigStore");

function getTiers() {
  return (getGuildConfig().reputation?.tiers || [])
    .slice()
    .sort((a, b) => b.threshold - a.threshold)
    .map((t) => ({
      amount: t.threshold,
      role: getRoleId(t.roleKey),
      label: t.label || `${t.roleKey} (${t.threshold}+ Rep)`,
    }))
    .filter((t) => t.role);
}

//---------------------------------------------
// DB Helpers
//---------------------------------------------
async function addOneRep(userId) {
  const doc = await Reputation.findOneAndUpdate(
    { userId },
    { $inc: { rep: 1 }, $setOnInsert: { userId } },
    { upsert: true, new: true }
  );
  return doc.rep;
}

async function incrementReputation(userId) {
  if (await RepBan.exists({ userId })) return null;
  return addOneRep(userId);
}

async function incrementReputationBatch(userIds) {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  if (!uniqueIds.length) return [];

  const bans = await RepBan.find({ userId: { $in: uniqueIds } })
    .select("userId")
    .lean();
  const bannedSet = new Set(bans.map((b) => b.userId));
  const eligible = uniqueIds.filter((id) => !bannedSet.has(id));
  if (!eligible.length) return [];

  await Reputation.bulkWrite(
    eligible.map((userId) => ({
      updateOne: {
        filter: { userId },
        update: { $inc: { rep: 1 }, $setOnInsert: { userId } },
        upsert: true,
      },
    }))
  );

  const docs = await Reputation.find({ userId: { $in: eligible } })
    .select("userId rep")
    .lean();

  return docs.map((d) => ({ userId: d.userId, rep: d.rep }));
}

// false when this giver already gave rep for this message.
async function claimRepGrant({ messageId, giverId, receiverId }) {
  try {
    await RepGrant.create({ messageId, giverId, receiverId });
    return true;
  } catch (err) {
    if (err?.code === 11000) return false;
    throw err;
  }
}

//---------------------------------------------
// Tier Sync Logic
//---------------------------------------------
async function ensureTierRoleAndCheckAdded(guild, member, announceChannel, rep) {
  try {
    if (member?.partial) {
      member = await guild.members.fetch(member.id).catch(() => member);
    }
    if (!member) return false;

    const me = guild.members.me;
    if (!me.permissions.has(PermissionsBitField.Flags.ManageRoles))
      return false;

    const tiers = getTiers();
    const ALL_TIER_IDS = tiers.map((t) => t.role);
    const eligible = tiers.find((t) => rep >= t.amount) || null;

    if (!eligible) {
      await member.roles.remove(ALL_TIER_IDS).catch(() => {});
      return false;
    }

    const previousTier = tiers.find((t) => rep - 1 >= t.amount) || null;
    const hadBefore = previousTier && previousTier.role === eligible.role;

    const toRemove = ALL_TIER_IDS.filter((r) => r !== eligible.role);
    await member.roles.remove(toRemove).catch(() => {});

    if (!hadBefore) {
      await member.roles.add(eligible.role).catch(() => {});

      if (announceChannel) {
        announceChannel
          .send(
            `🎉 Congratulations, ${member} has received the **${eligible.label}** role!`,
          )
          .catch(() => {});
      }

      return true;
    }

    return false;
  } catch (err) {
    console.error("[Reputation] ensureTierRole ERROR:", err);
    return false;
  }
}

//---------------------------------------------
// Single award for one message
//---------------------------------------------
/**
 * +1 rep to `member` from `giverId` for `messageId`, at most once per giver
 * per message. Syncs the tier role and posts "+1 Rep → @user (N)" in
 * `channel`. Returns { status } where status is one of self, bot, banned,
 * duplicate or awarded (with `rep`, the new total).
 */
async function awardMessageRep({ guild, channel, member, giverId, messageId }) {
  if (member.id === giverId) return { status: "self" };
  if (member.user?.bot) return { status: "bot" };
  if (await RepBan.exists({ userId: member.id })) return { status: "banned" };

  const claimed = await claimRepGrant({
    messageId,
    giverId,
    receiverId: member.id,
  });
  if (!claimed) return { status: "duplicate" };

  const rep = await addOneRep(member.id);
  await ensureTierRoleAndCheckAdded(guild, member, channel, rep);
  await channel
    .send(`+1 Rep → ${member} (**${rep}**)`)
    .catch((err) => console.error("[Reputation] announce failed:", err));

  return { status: "awarded", rep };
}

module.exports = {
  incrementReputation,
  incrementReputationBatch,
  claimRepGrant,
  ensureTierRoleAndCheckAdded,
  awardMessageRep,
};
