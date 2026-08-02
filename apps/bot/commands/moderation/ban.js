const { DEFAULT_BAN_MESSAGES } = require("@ralevel/db");
const { renderMessageTemplate } = require("@ralevel/shared");
const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} = require("discord.js");
const generateActionId = require("../../utils/generateId.js");
const logModAction = require("../../utils/logModAction");
const { getGuildConfig } = require("../../utils/guildConfigStore");

const DELETE_MESSAGE_SECONDS = {
  "1m": 60,
  "1h": 3600,
  "1d": 86400,
  "7d": 604800,
};

const SNOWFLAKE_RE = /^\d{17,20}$/;

function formatBanError(err) {
  const code = err?.code ?? err?.rawError?.code;
  const message = err?.message || String(err);
  if (code != null) return `${message} (code ${code})`;
  return message;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban a user from the server (works even if they left)")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("User to ban (pick from list, or leave empty and use userid)")
        .setRequired(false),
    )
    .addStringOption((option) =>
      option
        .setName("userid")
        .setDescription(
          "Discord user ID to ban — use this when they are not in the server",
        )
        .setRequired(false),
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("Reason for ban")
        .setRequired(true),
    )
    .addBooleanOption((option) =>
      option
        .setName("appealable")
        .setDescription("Is this ban appealable?")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("deletemsgs")
        .setDescription("Delete past messages from user")
        .addChoices(
          { name: "Past 1 minute", value: "1m" },
          { name: "Past 1 hour", value: "1h" },
          { name: "Past 1 day", value: "1d" },
          { name: "Past 7 days", value: "7d" },
        )
        .setRequired(true),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  async execute(interaction) {
    await interaction.deferReply();

    const resolvedUser = interaction.options.getUser("user");
    const rawUserValue = interaction.options.get("user")?.value;
    const useridOption = interaction.options.getString("userid")?.trim();
    const reason = interaction.options.getString("reason");
    const appealable = interaction.options.getBoolean("appealable");
    const deleteMsgs = interaction.options.getString("deletemsgs");

    const fromUserOption =
      resolvedUser?.id ??
      (typeof rawUserValue === "string" && SNOWFLAKE_RE.test(rawUserValue)
        ? rawUserValue
        : null);
    const fromUserIdOption =
      useridOption && SNOWFLAKE_RE.test(useridOption) ? useridOption : null;

    if (!fromUserOption && !fromUserIdOption) {
      if (useridOption && !SNOWFLAKE_RE.test(useridOption)) {
        return interaction.editReply({
          content:
            "❌ Invalid userid. Paste a Discord snowflake ID (17–20 digits).",
        });
      }
      return interaction.editReply({
        content:
          "❌ Provide either **user** or **userid**. Use **userid** when the person is not in the server.",
      });
    }

    if (
      fromUserOption &&
      fromUserIdOption &&
      fromUserOption !== fromUserIdOption
    ) {
      return interaction.editReply({
        content:
          "❌ **user** and **userid** do not match. Provide only one, or make sure both refer to the same account.",
      });
    }

    const targetId = fromUserOption || fromUserIdOption;
    const deleteSeconds = DELETE_MESSAGE_SECONDS[deleteMsgs];

    let user = resolvedUser;
    if (!user || user.id !== targetId) {
      try {
        user = await interaction.client.users.fetch(targetId);
      } catch {
        user = null;
      }
    }

    const userTag = user?.tag ?? `UserID: ${targetId}`;

    // DM user (may fail for non-members with no mutual servers)
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
          serverName: interaction.guild.name,
          userTag,
          userId: targetId,
          appealUrl: banMessages.appealUrl,
        });

        await user.send(message);
      } catch {}
    }

    // Ban by user ID — works even if they are not in the server
    try {
      await interaction.guild.bans.create(targetId, {
        reason,
        deleteMessageSeconds: deleteSeconds,
      });
    } catch (err) {
      console.error("[ban] bans.create failed:", err);
      return interaction.editReply({
        content: `❌ Failed to ban this user: ${formatBanError(err)}`,
      });
    }

    try {
      await interaction.guild.bans.fetch(targetId);
    } catch (err) {
      console.error("[ban] bans.fetch verify failed after create:", err);
      return interaction.editReply({
        content:
          "❌ Ban API returned success, but the user is not on the ban list. Check bot **Ban Members** permission and try again.",
      });
    }

    // Log action (DB + channel)
    const actionId = generateActionId();
    await logModAction({
      interaction,
      userId: targetId,
      userTag,
      moderatorTag: interaction.user.tag,
      moderatorId: interaction.user.id,
      action: "ban",
      reason,
      actionId,
      banAppealable: appealable ? "Yes" : "No",
      deletedMessages: deleteMsgs,
    });

    const embed = new EmbedBuilder()
      .setTitle("🔨 User Banned")
      .setColor("#ff0000")
      .addFields(
        { name: "User", value: `${userTag} (${targetId})` },
        { name: "Moderator", value: interaction.user.tag },
        { name: "Reason", value: reason },
        { name: "Appealable?", value: appealable ? "Yes" : "No" },
        { name: "Deleted Messages", value: deleteMsgs },
        { name: "Action ID", value: actionId },
      )
      .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
  },
};
