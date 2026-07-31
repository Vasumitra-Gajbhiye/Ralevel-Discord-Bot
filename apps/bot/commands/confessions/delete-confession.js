const { Confession, ConfessionReply } = require("@ralevel/db");
const { SlashCommandBuilder } = require("discord.js");
const {
  getGuildConfig,
  getChannelId,
  tryGetGuildConfig,
} = require("../../utils/guildConfigStore");

function parseConfessionId(raw) {
  if (!raw) return null;
  const cleaned = String(raw).trim().replace(/^#/, "");
  const id = Number(cleaned);
  if (!Number.isInteger(id) || id < 1) return null;
  return id;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("delete-confession")
    .setDescription("Delete one of your confessions by ID")
    .addStringOption((opt) =>
      opt
        .setName("id")
        .setDescription("Confession ID (e.g. 2 or #2)")
        .setRequired(true)
    ),

  async execute(interaction) {
    const cfg = tryGetGuildConfig();
    if (cfg?.features?.confessions === false) {
      return interaction.reply({
        content: "❌ Confessions are currently disabled.",
        ephemeral: true,
      });
    }

    const confessionId = parseConfessionId(
      interaction.options.getString("id")
    );

    if (!confessionId) {
      return interaction.reply({
        content:
          "❌ Please provide a valid confession ID (e.g. `2` or `#2`).",
        ephemeral: true,
      });
    }

    const confession = await Confession.findOne({
      confessionId,
      authorId: interaction.user.id,
    });

    if (!confession) {
      return interaction.reply({
        content:
          "❌ No confession found with that ID that belongs to you.",
        ephemeral: true,
      });
    }

    await interaction.deferReply({ ephemeral: true });

    // Best-effort Discord cleanup for posted confessions
    if (confession.threadId) {
      const thread = await interaction.client.channels
        .fetch(confession.threadId)
        .catch(() => null);
      if (thread) {
        await thread.delete("Confession deleted by author").catch(() => {});
      }
    }

    if (confession.postedMessageId) {
      const ventChannelKey =
        getGuildConfig().confessions?.ventChannelKey || "vent";
      const ventChannelId = getChannelId(ventChannelKey);
      if (ventChannelId) {
        const vent = await interaction.client.channels
          .fetch(ventChannelId)
          .catch(() => null);
        if (vent?.isTextBased?.()) {
          await vent.messages
            .delete(confession.postedMessageId)
            .catch(() => {});
        }
      }
    }

    await ConfessionReply.deleteMany({ confessionId });
    await Confession.deleteOne({ _id: confession._id });

    return interaction.editReply({
      content: `🗑️ Confession #${confessionId} has been deleted.`,
    });
  },
};
