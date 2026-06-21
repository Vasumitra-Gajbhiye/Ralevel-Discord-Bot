// systems/reputation.js
//--------------------------------------------------
// Reputation System Main File
//--------------------------------------------------

const Reputation = require("../models/reputation.js");
const RepBan = require("../models/repban.js");
const { PermissionsBitField } = require("discord.js");
const { createBoundedSet } = require("../utils/boundedSet.js");

const PROCESSED_MESSAGE_CACHE_SIZE = 10_000;

// Words
const THANK_WORDS = [
  "thanks!!",
  "thank you",
  "thank u",
  "thankuu",
  "thankuuu",
  "thankyou",
  "thanks",
  "thanks!",
  "thankss",
  "thankss!",
  "thankss!!",
  "thanksss",
  "ty",
  "tysm",
  "tyvm",
  "thx",
  "thanx",
  "thnx",
  "tnx",
  "tnx!",
  "thnk u",
  "thank you very much",
  "thank you so much",
  "thanks a lot",
  "thanks a ton",
  "many thanks",
  "appreciate it",
  "much appreciated",
  "really appreciate it",
  "appreciate ya",
  "i appreciate it",
  "tyty",
  "tytyy",
  "tyy",
  "tyuu",
  "tyssm",
  "tysmmm",
  "tysmm",
  "tysmmm!!!",
  "thxsm",
  "ty <3",
  "tysm <3",
  "thank yoi",
  "thank uo",
  "thakns",
  "thansk",
  "tahnks",
  "tahnx",
  "tnk u",
  "tyu",
  "tyyyy",
  "tyuy",
  "ty!!",
  "tysm!!",
  "thx!!",
  "thank you!!!",
  "tyyy!!!",
  "ty :D",
  "tysm :)",
  "ty <33",
  "tysmmm <333",
];
const WELCOME_WORDS = [
  "yw",
  "welcome",
  "np",
  "noworries",
  "noproblem",
  "nw",
  "nws",
];

// Tier roles
const ROLE_BEGINNER = process.env.ROLE_BEGINNER_ROLE_ID;
const ROLE_INTERMEDIATE = process.env.INTERMEDIATE_ROLE_ID;
const ROLE_ADVANCED = process.env.ADVANCED_ROLE_ID;
const ROLE_EXPERT = process.env.EXPERT_ROLE_ID;
const ROLE_GIGACHAD = process.env.GIGACHAD_ROLE_ID;

const TIERS = [
  { amount: 1000, role: ROLE_GIGACHAD, label: "Giga Chad (1000+ Rep)" },
  { amount: 500, role: ROLE_EXPERT, label: "Expert (500+ Rep)" },
  { amount: 100, role: ROLE_ADVANCED, label: "Advanced (100+ Rep)" },
  { amount: 50, role: ROLE_INTERMEDIATE, label: "Intermediate (50+ Rep)" },
  { amount: 10, role: ROLE_BEGINNER, label: "Beginner (10+ Rep)" },
];
const ALL_TIER_IDS = TIERS.map((t) => t.role);

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

function getTierByRep(rep) {
  return TIERS.find((t) => rep >= t.amount) || null;
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

    const eligible = getTierByRep(rep);

    if (!eligible) {
      await member.roles.remove(ALL_TIER_IDS).catch(() => {});
      return false;
    }

    const previousTier = getTierByRep(rep - 1);
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
      const content = message.content?.toLowerCase() || "";
      if (processedMessageIds.has(message.id)) return;

      // ---------- CASE 1: thank reply ----------
      if (message.reference && hasWholeWord(content, THANK_WORDS)) {
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
        hasWholeWord(content, THANK_WORDS) &&
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
      if (message.reference && hasWholeWord(content, WELCOME_WORDS)) {
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
