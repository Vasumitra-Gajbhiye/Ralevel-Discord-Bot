// systems/reputation.js
//--------------------------------------------------
// Reputation System Main File
//--------------------------------------------------
const { createBoundedSet } = require("../utils/boundedSet.js");
const { isContentOptedOut } = require("../utils/contentOptOut");
const { tryGetGuildConfig } = require("../utils/guildConfigStore");
const {
  incrementReputation,
  incrementReputationBatch,
  ensureTierRoleAndCheckAdded,
  awardMessageRep,
} = require("../utils/repAwards");

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

//---------------------------------------------
// MAIN EXPORT — returns message handler
//---------------------------------------------
function reputationSystem(client) {
  const processedMessageIds = createBoundedSet(PROCESSED_MESSAGE_CACHE_SIZE);

  async function handleReputationMessage(message) {
    try {
      const cfg = tryGetGuildConfig();
      if (cfg?.features?.reputation === false) return;
      // Opted-out authors' text is never read; they can still receive rep.
      if (isContentOptedOut(message.author.id)) return;

      const thankWords = cfg?.reputation?.thankWords || [];
      const welcomeWords = cfg?.reputation?.welcomeWords || [];

      const content = message.content?.toLowerCase() || "";
      if (processedMessageIds.has(message.id)) return;

      // ---------- CASE 1: thank reply ----------
      // Counts as the thanker giving rep for the replied-to message, so a
      // later Give Rep on that message from the same member is refused.
      if (message.reference && hasWholeWord(content, thankWords)) {
        const replied = await message.fetchReference().catch(() => null);
        const target = replied?.member;
        if (!target) return;

        const result = await awardMessageRep({
          guild: message.guild,
          channel: message.channel,
          member: target,
          giverId: message.author.id,
          messageId: message.reference.messageId,
        });
        if (result.status === "awarded") processedMessageIds.add(message.id);
        return;
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
      // The member being replied to is the giver of this "yw" message.
      if (message.reference && hasWholeWord(content, welcomeWords)) {
        const replied = await message.fetchReference().catch(() => null);
        if (!replied || !message.member) return;

        const result = await awardMessageRep({
          guild: message.guild,
          channel: message.channel,
          member: message.member,
          giverId: replied.author.id,
          messageId: message.id,
        });
        if (result.status === "awarded") processedMessageIds.add(message.id);
        return;
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
