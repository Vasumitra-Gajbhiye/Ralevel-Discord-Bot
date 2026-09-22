const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} = require("discord.js");
const generateActionId = require("../../utils/generateId.js");
const logModAction = require("../../utils/logModAction");
const banUser = require("../../utils/banUser.js");

const SNOWFLAKE_RE = /^\d{17,20}$/;

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban a user from the server (works even if they left)")
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

    let user = resolvedUser;
    if (!user || user.id !== targetId) {
      try {
        user = await interaction.client.users.fetch(targetId);
      } catch {
        user = null;
      }
    }

    const userTag = user?.tag ?? `UserID: ${targetId}`;

    const result = await banUser({
      guild: interaction.guild,
      targetId,
      user,
      userTag,
      reason,
      appealable,
      deleteMessages: deleteMsgs,
    });

    if (!result.ok) {
      return interaction.editReply({ content: result.error });
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
