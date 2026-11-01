const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const {
  isContentOptedOut,
  setContentOptOut,
} = require("../../utils/contentOptOut");
const {
  getDeletionCooldownRemaining,
  getStoredUserData,
  deleteUserData,
} = require("../../utils/deleteUserData");

const PRIVACY_POLICY_URL =
  "https://ralevel.com/legal/ralevel-bot/privacy-policy";
const CONFIRM_TIMEOUT_MS = 60_000;

const OPT_OUT_SCOPE =
  "Covers reputation thank-you detection on your messages and sticky line counting. " +
  "It does not cover modmail or moderator DM conversations (you're sending those to staff through the bot) " +
  "or moderation tools such as /purge filters. XP counts your messages but never reads their text.";

const NOT_DELETED =
  "Moderation records (warnings, notes, timeouts, bans), modmail tickets, confessions, " +
  "certificates, XP bans and rep bans are **not** deleted. Contact staff through modmail about those.";

function guildIdOf(interaction) {
  return interaction.guildId || process.env.GUILD_ID;
}

function cooldownText(remainingMs) {
  const unix = Math.ceil((Date.now() + remainingMs) / 1000);
  return `⏳ You can only delete your data once every 24 hours. Try again <t:${unix}:R>.`;
}

async function handleStatus(interaction) {
  const data = await getStoredUserData(
    guildIdOf(interaction),
    interaction.user.id,
  );

  const embed = new EmbedBuilder()
    .setTitle("🔒 Your Privacy Settings")
    .setColor("#00AEEF")
    .addFields(
      {
        name: "Message-content processing",
        value: `${data.contentOptOut ? "**Off** (you've opted out)" : "**On**"}\n${OPT_OUT_SCOPE}`,
      },
      {
        name: "What the bot stores about you",
        value: [
          `• XP: **${data.xp}** (messages counted: **${data.messages}**)`,
          `• Reputation: **${data.rep}**`,
          "• Which messages you gave or received rep for (kept 30 days)",
          `• Poll votes: **${data.pollVotes}**`,
          "• Your privacy preferences",
        ].join("\n"),
      },
      {
        name: "Deleting your data",
        value: `\`/privacy delete-my-data\` removes your XP, message count, reputation (and rep records) and poll votes.\n${NOT_DELETED}`,
      },
      { name: "Privacy policy", value: PRIVACY_POLICY_URL },
    )
    .setTimestamp();

  return interaction.reply({ embeds: [embed] });
}

async function handleMessageContent(interaction) {
  // "off" turns message-content processing off, i.e. opts the member out.
  const optOut = interaction.options.getString("setting", true) === "off";
  await setContentOptOut(interaction.user.id, optOut);

  return interaction.reply({
    content: optOut
      ? `✅ Message-content processing is **off**. The bot will no longer read the text of your messages for reputation or sticky counting. You can still receive rep from others and give it with **Apps → Give Rep** on a message.\n-# ${OPT_OUT_SCOPE}`
      : "✅ Message-content processing is **on**. Your thank-you messages can award reputation again.",
  });
}

async function handleDeleteMyData(interaction) {
  const userId = interaction.user.id;

  const remaining = await getDeletionCooldownRemaining(userId);
  if (remaining > 0) {
    return interaction.reply({ content: cooldownText(remaining) });
  }

  // Scoped to the invoking user so nobody else's click can match.
  const confirmId = `privacy-delete-confirm:${userId}`;
  const cancelId = `privacy-delete-cancel:${userId}`;
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(confirmId)
      .setLabel("Confirm")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(cancelId)
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Secondary),
  );

  const response = await interaction.reply({
    content: [
      "⚠️ **Delete your data?** This can't be undone.",
      "",
      "This permanently deletes your **XP and message count**, **reputation** (and records of rep you gave or received) and **poll votes**, and removes rank / reputation roles they earned you.",
      "Your message-content setting is kept.",
      "",
      NOT_DELETED,
      "",
      `-# This confirmation expires in ${CONFIRM_TIMEOUT_MS / 1000} seconds.`,
    ].join("\n"),
    components: [row],
  });

  let button;
  try {
    button = await response.awaitMessageComponent({
      filter: (i) =>
        i.user.id === userId && [confirmId, cancelId].includes(i.customId),
      time: CONFIRM_TIMEOUT_MS,
    });
  } catch {
    return interaction.editReply({
      content: "⌛ Timed out — nothing was deleted.",
      components: [],
    });
  }

  if (button.customId === cancelId) {
    return button.update({ content: "Cancelled — nothing was deleted.", components: [] });
  }

  // Re-check in case a second confirmation was opened in parallel.
  const remainingNow = await getDeletionCooldownRemaining(userId);
  if (remainingNow > 0) {
    return button.update({ content: cooldownText(remainingNow), components: [] });
  }

  await button.deferUpdate();
  const result = await deleteUserData({
    guild: interaction.guild,
    guildId: guildIdOf(interaction),
    userId,
  });

  if (result.busy) {
    return interaction.editReply({
      content: "⏳ An XP sync is running right now, so nothing was deleted. Please try again in a minute.",
      components: [],
    });
  }

  return interaction.editReply({
    content: [
      "🗑️ Your data has been deleted: XP, message count, reputation, poll votes and any pending XP.",
      isContentOptedOut(userId)
        ? "Message-content processing is still **off** for you."
        : "Message-content processing is **on** (`/privacy message-content off` to opt out).",
      "If you keep chatting, new XP will be counted from zero.",
    ].join("\n"),
    components: [],
  });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("privacy")
    .setDescription("View or change what the bot stores about you.")
    .addSubcommand((sub) =>
      sub
        .setName("status")
        .setDescription("See your privacy settings and what the bot stores about you."),
    )
    .addSubcommand((sub) =>
      sub
        .setName("message-content")
        .setDescription("Turn off (or back on) the bot reading your message text.")
        .addStringOption((opt) =>
          opt
            .setName("setting")
            .setDescription("Off = the bot stops reading your message text")
            .setRequired(true)
            .addChoices(
              { name: "on", value: "on" },
              { name: "off", value: "off" },
            ),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("delete-my-data")
        .setDescription("Delete your XP, message count, reputation and poll votes."),
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === "status") return handleStatus(interaction);
    if (sub === "message-content") return handleMessageContent(interaction);
    if (sub === "delete-my-data") return handleDeleteMyData(interaction);
  },
};
