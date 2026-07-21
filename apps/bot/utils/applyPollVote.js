const { PollVote } = require("@ralevel/db");

async function applyPollVote({ pollId, userId, optionId, choiceType, optionLabel }) {
  const existing = await PollVote.findOne({ pollId, userId }).lean();
  const now = new Date();

  if (choiceType === "single") {
    const alreadySelected = existing?.optionIds?.includes(optionId);

    if (alreadySelected) {
      await PollVote.findOneAndUpdate(
        { pollId, userId },
        { $set: { optionIds: [], updatedAt: now } },
      );
      return { message: "✅ Your vote has been removed." };
    }

    await PollVote.findOneAndUpdate(
      { pollId, userId },
      { $set: { optionIds: [optionId], updatedAt: now } },
      { upsert: true },
    );
    return { message: `✅ Vote recorded for **${optionLabel}**.` };
  }

  const idx = existing?.optionIds?.indexOf(optionId) ?? -1;

  if (idx >= 0) {
    await PollVote.findOneAndUpdate(
      { pollId, userId },
      { $pull: { optionIds: optionId }, $set: { updatedAt: now } },
    );
    return { message: "✅ Option removed from your vote." };
  }

  await PollVote.findOneAndUpdate(
    { pollId, userId },
    { $addToSet: { optionIds: optionId }, $set: { updatedAt: now } },
    { upsert: true },
  );
  return { message: `✅ **${optionLabel}** added to your vote.` };
}

module.exports = applyPollVote;
