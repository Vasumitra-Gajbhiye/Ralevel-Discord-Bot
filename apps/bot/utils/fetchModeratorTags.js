async function fetchModeratorTags(client, moderatorIds) {
  const uniqueIds = [...new Set(moderatorIds.filter(Boolean))];
  const entries = await Promise.all(
    uniqueIds.map(async (id) => {
      try {
        const user = await client.users.fetch(id);
        return [id, user.tag];
      } catch {
        return [id, "Unknown Moderator"];
      }
    }),
  );
  return new Map(entries);
}

module.exports = fetchModeratorTags;
