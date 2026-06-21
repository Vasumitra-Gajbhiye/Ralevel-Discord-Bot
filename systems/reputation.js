// systems/reputation.js
//--------------------------------------------------
// Reputation System Main File
//--------------------------------------------------

const Reputation = require("../models/reputation.js");
const RepBan = require("../models/repban.js");
const { PermissionsBitField } = require("discord.js");

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

//---------------------------------------------
// DB Helpers
//---------------------------------------------
async function getRepRecord(userId) {
  return Reputation.findOneAndUpdate(
    { userId },
    { $setOnInsert: { userId, rep: 0 } },
    { upsert: true, new: true }
  );
}

async function addReputation(userId) {
  if (await RepBan.findOne({ userId })) return null;
  const doc = await getRepRecord(userId);
  doc.rep += 1;
  await doc.save();
  return doc.rep;
}

//---------------------------------------------
// Tier Sync Logic
//---------------------------------------------
async function ensureTierRoleAndCheckAdded(guild, member, announceChannel) {
  try {
    member = await guild.members.fetch(member.id).catch(() => member);
    if (!member) return false;

    if (await RepBan.findOne({ userId: member.id })) return false;

    const me = guild.members.me;
    if (!me.permissions.has(PermissionsBitField.Flags.ManageRoles))
      return false;

    const repDoc = await getRepRecord(member.id);
    const rep = repDoc.rep ?? 0;

    const eligible = TIERS.find((t) => rep >= t.amount);

    if (!eligible) {
      await member.roles.remove(ALL_TIER_IDS).catch(() => {});
      return false;
    }

    function getTierByRep(rep) {
      return TIERS.find((t) => rep >= t.amount) || null;
    }

    // NEW: get previous tier from rep - 1
    const previousTier = getTierByRep(rep - 1);

    // Determine if new tier is different
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
module.exports = function reputationSystem(client) {
  const processedMessageIds = new Set();

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

        const newRep = await addReputation(target.id);
        if (newRep === null) return;

        processedMessageIds.add(message.id);
        await ensureTierRoleAndCheckAdded(
          message.guild,
          target,
          message.channel,
        );

        return message.channel.send(`+1 Rep → ${target} (**${newRep}**)`);
      }

      // ---------- CASE 2: thank @members ----------
      if (
        !message.reference &&
        hasWholeWord(content, THANK_WORDS) &&
        message.mentions.members.size
      ) {
        let processed = new Set();
        let awarded = false;

        for (const m of message.mentions.members.values()) {
          if (!m || m.id === message.author.id) continue;
          if (processed.has(m.id)) continue;

          const newRep = await addReputation(m.id);
          if (newRep === null) continue;

          processed.add(m.id);
          awarded = true;

          await ensureTierRoleAndCheckAdded(message.guild, m, message.channel);
          await message.channel.send(`+1 Rep → ${m} (**${newRep}**)`);
        }

        if (awarded) processedMessageIds.add(message.id);
        return;
      }

      // ---------- CASE 3: yw reply to a thank ----------
      if (message.reference && hasWholeWord(content, WELCOME_WORDS)) {
        const replied = await message.fetchReference().catch(() => null);
        if (!replied) return;
        // if (!hasWholeWord(replied.content?.toLowerCase(), THANK_WORDS)) return;

        const newRep = await addReputation(message.author.id);
        if (newRep === null) return;

        processedMessageIds.add(message.id);

        await ensureTierRoleAndCheckAdded(
          message.guild,
          message.member,
          message.channel,
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
};
