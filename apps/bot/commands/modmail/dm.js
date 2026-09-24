const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { openModDm } = require("../../systems/modDm");

function failureMessage(result, target) {
  switch (result.reason) {
    case "not_configured":
      return 'Moderator DMs aren\'t set up yet — add the forum channel under the key `modDm` on the dashboard\'s Channels page.';
    case "bad_forum":
      return "The `modDm` channel must be a Discord forum channel. Check the Channels page on the dashboard.";
    case "clashes_with_modmail":
      return "The `modDm` channel is the same as a modmail forum. Point it to a separate forum channel on the dashboard.";
    case "bot":
      return "You can't DM a bot.";
    case "opted_out": {
      const since = result.optedOutAt
        ? ` (since <t:${Math.floor(new Date(result.optedOutAt).getTime() / 1000)}:R>)`
        : "";
      return `${target} has turned off moderator DMs${since}. Only they can turn them back on.`;
    }
    case "already_open":
      return result.threadId
        ? `There's already an open conversation with ${target}: <#${result.threadId}>`
        : `There's already an open conversation with ${target}.`;
    case "open_ticket":
      return `${target} has an open modmail ticket — reply there instead: <#${result.threadId}>`;
    case "dms_closed":
      return `Couldn't DM ${target} — their DMs are closed or they've blocked the bot.`;
    default:
      return "Couldn't open the conversation. Please try again.";
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("dm")
    .setDescription("Start a private DM conversation with a member through the bot.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("The member to DM.")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("message")
        .setDescription("Optional first message to send them.")
        .setRequired(false)
        .setMaxLength(2000),
    ),

  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({
        content: "This command can only be used in the server.",
        ephemeral: true,
      });
    }

    const target = interaction.options.getUser("user", true);
    const initialMessage = interaction.options.getString("message")?.trim() || null;

    await interaction.deferReply({ ephemeral: true });

    const result = await openModDm(interaction.client, {
      guild: interaction.guild,
      target,
      moderator: interaction.user,
      initialMessage,
    });

    if (!result.ok) {
      return interaction.editReply({ content: failureMessage(result, target) });
    }

    const lines = [
      `✅ Conversation with ${target} ${result.reused ? "reopened" : "opened"}: <#${result.thread.id}>`,
    ];
    if (result.initialMessageFailed) {
      lines.push("⚠️ Your first message couldn't be delivered — send it again in the post.");
    }
    return interaction.editReply({ content: lines.join("\n") });
  },
};
