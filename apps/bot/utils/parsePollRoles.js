/**
 * Extract role IDs from Discord role mentions (<@&id>) and raw snowflakes.
 */
function parseRoleIdsFromString(input) {
  if (!input || typeof input !== "string") return [];

  const ids = new Set();

  const mentionMatches = input.matchAll(/<@&(\d{17,20})>/g);
  for (const match of mentionMatches) {
    ids.add(match[1]);
  }

  const snowflakeMatches = input.match(/\b\d{17,20}\b/g);
  if (snowflakeMatches) {
    for (const id of snowflakeMatches) {
      ids.add(id);
    }
  }

  return [...ids];
}

/**
 * Parse role IDs and validate they exist in the guild.
 * Returns { roleIds, invalidIds }.
 */
function parseAndValidatePollRoles(guild, input) {
  const parsed = parseRoleIdsFromString(input);
  const roleIds = [];
  const invalidIds = [];

  for (const id of parsed) {
    if (guild.roles.cache.has(id)) {
      roleIds.push(id);
    } else {
      invalidIds.push(id);
    }
  }

  return { roleIds, invalidIds };
}

module.exports = {
  parseRoleIdsFromString,
  parseAndValidatePollRoles,
};
