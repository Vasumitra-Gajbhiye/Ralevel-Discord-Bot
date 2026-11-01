const { REP_GRANT_TTL_SEC } = require("@ralevel/db");
const {
  ContextMenuCommandBuilder,
  ApplicationCommandType,
} = require("discord.js");
const { isReputationDisabled } = require("../../systems/messageRouter");
const { tryGetGuildConfig } = require("../../utils/guildConfigStore");
const { awardMessageRep } = require("../../utils/repAwards");

// Grant records expire after this long, so older messages can't be checked
// for a previous award.
const MAX_MESSAGE_AGE_MS = REP_GRANT_TTL_SEC * 1000;

// Message context menu (right-click → Apps → Give Rep). Never reads the
// message text, so the /privacy message-content opt-out doesn't apply.
module.exports = {
  data: new ContextMenuCommandBuilder()
    .setName("Give Rep")
    .setType(ApplicationCommandType.Message)
    .setDMPermission(false),

  async execute(interaction) {
    const message = interaction.targetMessage;
    const channel = message.channel ?? interaction.channel;
    const cfg = tryGetGuildConfig();

    if (cfg?.features?.reputation === false) {
      return interaction.reply({
        content: "❌ Reputation is turned off on this server.",
      });
    }
    if (isReputationDisabled({ channel })) {
      return interaction.reply({
        content: "❌ Reputation is disabled in this channel.",
      });
    }
    if (message.author.bot) {
      return interaction.reply({ content: "❌ Bots can't receive reputation." });
    }
    if (message.author.id === interaction.user.id) {
      return interaction.reply({ content: "❌ You can't give rep to yourself." });
    }
    if (Date.now() - message.createdTimestamp > MAX_MESSAGE_AGE_MS) {
      return interaction.reply({
        content: `❌ You can only give rep for messages from the last ${MAX_MESSAGE_AGE_MS / 86_400_000} days.`,
      });
    }

    const member =
      message.member ??
      (await interaction.guild.members
        .fetch(message.author.id)
        .catch(() => null));
    if (!member) {
      return interaction.reply({
        content: "❌ That member isn't in the server anymore.",
      });
    }

    await interaction.deferReply();

    const result = await awardMessageRep({
      guild: interaction.guild,
      channel,
      member,
      giverId: interaction.user.id,
      messageId: message.id,
    });

    const replies = {
      self: "❌ You can't give rep to yourself.",
      bot: "❌ Bots can't receive reputation.",
      banned: `❌ ${member} can't receive reputation.`,
      duplicate: "ℹ️ You've already given rep for this message.",
      awarded: `✅ Gave +1 rep to ${member} (now **${result.rep}**).`,
    };

    return interaction.editReply({ content: replies[result.status] });
  },
};
