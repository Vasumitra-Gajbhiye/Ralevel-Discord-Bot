const { DEFAULT_BAN_MESSAGES } = require("@ralevel/db");
const { renderMessageTemplate } = require("@ralevel/shared");
const { getGuildConfig } = require("./guildConfigStore");

const DELETE_MESSAGE_SECONDS = {
  "1m": 60,
  "1h": 3600,
  "1d": 86400,
  "7d": 604800,
};

function formatBanError(err) {
  const code = err?.code ?? err?.rawError?.code;
  const message = err?.message || String(err);
  if (code != null) return `${message} (code ${code})`;
  return message;
}

/**
 * DM the user the configured ban template, ban them by ID, and verify the ban.
 * `user` may be null when the account cannot be fetched (DM is skipped).
 * @returns {Promise<{ ok: true } | { ok: false, error: string }>}
 */
async function banUser({
  guild,
  targetId,
  user,
  userTag,
  reason,
  appealable,
  deleteMessages,
}) {
  if (user) {
    try {
      const banMessages = {
        ...DEFAULT_BAN_MESSAGES,
        ...getGuildConfig().moderation?.banMessages,
      };
      const template = appealable
        ? banMessages.banAppealable
        : banMessages.banNotAppealable;

      const message = renderMessageTemplate(template, {
        reason,
        serverName: guild.name,
        userTag,
        userId: targetId,
        appealUrl: banMessages.appealUrl,
      });

      await user.send(message);
    } catch {}
  }

  // Ban by user ID — works even if they are not in the server
  try {
    await guild.bans.create(targetId, {
      reason,
      deleteMessageSeconds: DELETE_MESSAGE_SECONDS[deleteMessages],
    });
  } catch (err) {
    console.error("[ban] bans.create failed:", err);
    return {
      ok: false,
      error: `❌ Failed to ban this user: ${formatBanError(err)}`,
    };
  }

  try {
    await guild.bans.fetch(targetId);
  } catch (err) {
    console.error("[ban] bans.fetch verify failed after create:", err);
    return {
      ok: false,
      error:
        "❌ Ban API returned success, but the user is not on the ban list. Check bot **Ban Members** permission and try again.",
    };
  }

  return { ok: true };
}

module.exports = banUser;
module.exports.DELETE_MESSAGE_SECONDS = DELETE_MESSAGE_SECONDS;
