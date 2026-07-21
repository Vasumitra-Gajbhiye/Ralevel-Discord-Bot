// systems/reputation.js
//--------------------------------------------------
// Reputation System Main File
//--------------------------------------------------
const { Reputation, RepBan } = require("@ralevel/db");

const { PermissionsBitField } = require("discord.js");
const { createBoundedSet } = require("../utils/boundedSet.js");
const {
  getGuildConfig,
  getRoleId,
  tryGetGuildConfig,
} = require("../utils/guildConfigStore");

const PROCESSED_MESSAGE_CACHE_SIZE = 10_000;

//---------------------------------------------
// Helper: token split
//---------------------------------------------
function splitTokens(text) {
  return (text || "").toLowerCase().split(/\s+/).filter(Boolean);
}

function hasWholeWord(str, list) {
  if (!str) return false;
  const tokens = splitTokens(str);
  return tokens.some((t) => list.includes(t));
}

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

function getTierByRep(rep) {
  return getTiers().find((t) => rep >= t.amount) || null;
}

//---------------------------------------------
// DB Helpers
//---------------------------------------------
async function incrementReputation(userId) {
  if (await RepBan.exists({ userId })) return null;

  const doc = await Reputation.findOneAndUpdate(
    { userId },
    { $inc: { rep: 1 }, $setOnInsert: { userId } },
    { upsert: true, new: true }
  );
  return doc.rep;
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
// MAIN EXPORT — returns message handler
//---------------------------------------------
function reputationSystem(client) {
  const processedMessageIds = createBoundedSet(PROCESSED_MESSAGE_CACHE_SIZE);

  async function handleReputationMessage(message) {
    try {
      const cfg = tryGetGuildConfig();
      if (cfg?.features?.reputation === false) return;

      const thankWords = cfg?.reputation?.thankWords || [];
      const welcomeWords = cfg?.reputation?.welcomeWords || [];

      const content = message.content?.toLowerCase() || "";
      if (processedMessageIds.has(message.id)) return;

      // ---------- CASE 1: thank reply ----------
      if (message.reference && hasWholeWord(content, thankWords)) {
        const replied = await message.fetchReference().catch(() => null);
        const target = replied?.member;
        if (!target) return;
        if (target.id === message.author.id) return;

        const newRep = await incrementReputation(target.id);
        if (newRep === null) return;

        processedMessageIds.add(message.id);
        await ensureTierRoleAndCheckAdded(
          message.guild,
          target,
          message.channel,
          newRep,
        );

        return message.channel.send(`+1 Rep → ${target} (**${newRep}**)`);
      }

      // ---------- CASE 2: thank @members ----------
      if (
        !message.reference &&
        hasWholeWord(content, thankWords) &&
        message.mentions.members.size
      ) {
        const membersById = new Map();
        for (const m of message.mentions.members.values()) {
          if (!m || m.id === message.author.id) continue;
          membersById.set(m.id, m);
        }

        if (!membersById.size) return;

        const awards = await incrementReputationBatch([...membersById.keys()]);
        if (!awards.length) return;

        processedMessageIds.add(message.id);

        await Promise.all(
          awards.map(({ userId, rep }) =>
            ensureTierRoleAndCheckAdded(
              message.guild,
              membersById.get(userId),
              message.channel,
              rep,
            ),
          ),
        );

        const parts = awards.map(({ userId, rep }) => {
          const member = membersById.get(userId);
          return `${member} (**${rep}**)`;
        });

        return message.channel.send(`+1 Rep → ${parts.join(", ")}`);
      }

      // ---------- CASE 3: yw reply to a thank ----------
      if (message.reference && hasWholeWord(content, welcomeWords)) {
        const replied = await message.fetchReference().catch(() => null);
        if (!replied) return;

        const newRep = await incrementReputation(message.author.id);
        if (newRep === null) return;

        processedMessageIds.add(message.id);

        await ensureTierRoleAndCheckAdded(
          message.guild,
          message.member,
          message.channel,
          newRep,
        );
        return message.channel.send(
          `+1 Rep → ${message.author} (**${newRep}**)`,
        );
      }
    } catch (err) {
      console.error("[Reputation] Message Handler Error:", err);
    }
  }

  console.log("✅ Reputation system loaded");
  return handleReputationMessage;
}

module.exports = reputationSystem;
module.exports.incrementReputation = incrementReputation;
module.exports.incrementReputationBatch = incrementReputationBatch;
module.exports.ensureTierRoleAndCheckAdded = ensureTierRoleAndCheckAdded;
