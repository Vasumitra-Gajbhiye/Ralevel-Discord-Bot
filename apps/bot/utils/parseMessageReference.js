const MESSAGE_LINK_REGEX =
  /^(?:https?:\/\/)?(?:ptb\.|canary\.)?discord(?:app)?\.com\/channels\/(\d+)\/(\d+)\/(\d+)\/?$/i;

const SNOWFLAKE_REGEX = /^\d{17,20}$/;

/**
 * Parse a message ID or Discord message link.
 * @param {string} input
 * @param {string} guildId
 * @returns {{ channelId?: string, messageId: string } | { error: string }}
 */
function parseMessageReference(input, guildId) {
  const trimmed = input.trim();

  const linkMatch = trimmed.match(MESSAGE_LINK_REGEX);
  if (linkMatch) {
    const [, linkGuildId, channelId, messageId] = linkMatch;
    if (linkGuildId !== guildId) {
      return { error: "❌ That message link is from a different server." };
    }
    return { channelId, messageId };
  }

  if (SNOWFLAKE_REGEX.test(trimmed)) {
    return { messageId: trimmed };
  }

  return {
    error:
      "❌ Invalid message ID or link. Provide a message ID or Discord message link.",
  };
}

module.exports = parseMessageReference;
