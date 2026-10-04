const {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  Events,
  PermissionFlagsBits,
  StickerFormatType,
} = require("discord.js");
const { ModDm } = require("@ralevel/db");
const {
  getChannelId,
  getCommandAllowedRoleIds,
  tryGetGuildConfig,
} = require("../utils/guildConfigStore");
const modmail = require("./modmail");

// Moderator-initiated DM conversations. Mods chat in a per-user forum post and
// every message is relayed to the user's DMs as plain text (no embeds).

const DM_CLOSED_ERROR_CODE = 50007;
const MAX_MESSAGE_LENGTH = 2000;
const NO_MENTIONS = { parse: [] };
const INTRO_EMBED_COLOR = 0x5865f2;

const END_BUTTON_PREFIX = "moddm_end:";
const OPT_OUT_BUTTON_ID = "moddm_optout";
const OPT_OUT_CONFIRM_ID = "moddm_optout_confirm";
const OPT_OUT_CANCEL_ID = "moddm_optout_cancel";
const OPT_IN_BUTTON_ID = "moddm_optin";
const STAFF_CLOSE_BUTTON_ID = "moddm_staff_close";
const BUTTON_PREFIX = "moddm_";

const SUPPORT_HINT =
  "If you ever need help, just send me a message to open a support ticket.";

function getModDmForumId() {
  const fromConfig = getChannelId("modDm");
  if (typeof fromConfig === "string" && fromConfig.trim()) {
    return fromConfig.trim();
  }
  return process.env.MOD_DM_CHANNEL_ID?.trim() || null;
}

function isModDmForumParent(parentId) {
  const forumId = getModDmForumId();
  return Boolean(parentId && forumId && parentId === forumId);
}

function clashesWithModmail(forumId) {
  if (!forumId) return false;
  return (
    forumId === modmail.getModMailChannelId() ||
    forumId === modmail.getAdminModMailChannelId()
  );
}

function isDmClosedError(err) {
  return err?.code === DM_CLOSED_ERROR_CODE;
}

function timestamp(date = new Date()) {
  return `<t:${Math.floor(date.getTime() / 1000)}:f>`;
}

function threadNameFor(user) {
  const raw = String(user.username || "user")
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, "")
    .slice(0, 80);
  return `dm-${raw || user.id}`.slice(0, 100);
}

function defaultGuildId() {
  return tryGetGuildConfig()?.guildId || process.env.GUILD_ID || "unknown";
}

async function findOpenModDmByUser(userId) {
  return ModDm.findOne({ userId, status: "OPEN" });
}

const UNKNOWN_CHANNEL_ERROR_CODE = 10003;

async function fetchThread(client, threadId) {
  if (!threadId) return null;
  return client.channels.fetch(threadId).catch(() => null);
}

/** Like fetchThread, but only a deleted post yields null; other API errors throw. */
async function fetchThreadUnlessDeleted(client, threadId) {
  if (!threadId) return null;
  try {
    return await client.channels.fetch(threadId);
  } catch (err) {
    if (err?.code === UNKNOWN_CHANNEL_ERROR_CODE) return null;
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Plain-text relay
// ---------------------------------------------------------------------------

/** Split text into Discord-sized messages, preferring line then word breaks. */
function splitMessageContent(text, limit = MAX_MESSAGE_LENGTH) {
  const chunks = [];
  let rest = String(text || "").trim();
  while (rest.length > limit) {
    let cut = rest.lastIndexOf("\n", limit);
    if (cut < limit / 2) cut = rest.lastIndexOf(" ", limit);
    if (cut < limit / 2) cut = limit;
    chunks.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

function quoteLines(text) {
  return text
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
}

/** Message text kept as-is (newlines, markdown, GIF links) plus forwards and sticker names. */
function buildPlainRelayText(message) {
  const parts = [];
  const own = message.content?.trim();
  if (own) parts.push(own);

  const snapshots = message.messageSnapshots?.size
    ? [...message.messageSnapshots.values()]
    : [];
  for (const snapshot of snapshots) {
    const text = snapshot.content?.trim();
    parts.push(
      text ? `↪ *Forwarded message*\n${quoteLines(text)}` : "↪ *Forwarded message*"
    );
  }

  const stickers = modmail.relayStickers(message);
  if (stickers.length) {
    parts.push(stickers.map((sticker) => `*Sticker: ${sticker.name}*`).join("\n"));
  }

  return parts.join("\n\n");
}

function addStickerFiles(prepared, message) {
  const stickers = modmail
    .relayStickers(message)
    .filter((sticker) => sticker.format !== StickerFormatType.Lottie && sticker.url);
  stickers.forEach((sticker, index) => {
    const ext = sticker.format === StickerFormatType.GIF ? "gif" : "png";
    const file = new AttachmentBuilder(sticker.url, {
      name: `sticker-${index + 1}.${ext}`,
    });
    if (prepared.files.length < modmail.MAX_FILES_PER_MESSAGE) {
      prepared.files.push(file);
    } else {
      prepared.extraFiles.push(file);
    }
  });
}

function attachFailureNote(failed) {
  if (!failed?.length) return "";
  const list = failed.map((item) => `${item.name} (${item.reason})`).join(", ");
  return `-# Couldn't attach: ${list}`.slice(0, MAX_MESSAGE_LENGTH);
}

function relayPayload(content, { files = [], replyOptions = {} } = {}) {
  const payload = {
    allowedMentions: { ...NO_MENTIONS, ...(replyOptions.allowedMentions || {}) },
  };
  if (content) payload.content = content;
  if (replyOptions.reply) payload.reply = replyOptions.reply;
  if (files.length) payload.files = files;
  return payload;
}

/**
 * Plain-text counterpart of modmail's embed relay. Mentions are always
 * disabled so a user typing @everyone in DMs can never ping the server.
 * Returns the first sent message (used for reply mapping), or null.
 */
async function sendPlainRelay(target, message, { replyToMessageId } = {}) {
  const prepared = modmail.prepareRelayAttachments(message, {
    maxBytes: modmail.uploadLimitFor(target),
    includeGifEmbeds: false,
  });
  addStickerFiles(prepared, message);

  const chunks = splitMessageContent(buildPlainRelayText(message));
  const replyOptions = modmail.buildRelayReplyOptions(replyToMessageId);

  const sendFirst = async (files, failed) => {
    const [first = "", ...rest] = chunks;
    const trailing = [...rest];
    const note = attachFailureNote(failed);
    let content = first;
    if (note) {
      if (!content) {
        content = note;
      } else if (
        !trailing.length &&
        content.length + note.length + 1 <= MAX_MESSAGE_LENGTH
      ) {
        content = `${content}\n${note}`;
      } else {
        trailing.push(note);
      }
    }
    if (!content && !files.length) return { sent: null, trailing };
    const sent = await target.send(relayPayload(content, { files, replyOptions }));
    return { sent, trailing };
  };

  let first;
  try {
    first = await sendFirst(prepared.files, prepared.failed);
  } catch (err) {
    if (!prepared.files.length || isDmClosedError(err)) throw err;
    console.error("[mod-dm] Failed to rehost attachments:", err);
    first = await sendFirst([], [
      ...prepared.failed,
      ...modmail.fileFailureEntries(prepared.files, "too large or unavailable"),
      ...modmail.fileFailureEntries(prepared.extraFiles, "too large or unavailable"),
    ]);
    prepared.extraFiles = [];
  }

  for (const chunk of first.trailing) {
    await target.send(relayPayload(chunk));
  }

  const batchSize = modmail.MAX_FILES_PER_MESSAGE;
  for (let i = 0; i < prepared.extraFiles.length; i += batchSize) {
    const batch = prepared.extraFiles.slice(i, i + batchSize);
    try {
      await target.send(relayPayload("", { files: batch }));
    } catch (err) {
      console.error("[mod-dm] Failed to rehost extra attachments:", err);
      await target
        .send(
          relayPayload(
            attachFailureNote(
              modmail.fileFailureEntries(batch, "too large or unavailable")
            )
          )
        )
        .catch(() => {});
    }
  }

  return first.sent;
}

// ---------------------------------------------------------------------------
// Message builders
// ---------------------------------------------------------------------------

function optOutButton() {
  return new ButtonBuilder()
    .setCustomId(OPT_OUT_BUTTON_ID)
    .setLabel("Don't DM me again")
    .setStyle(ButtonStyle.Danger);
}

function optOutRow() {
  return new ActionRowBuilder().addComponents(optOutButton());
}

function introRow(session) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${END_BUTTON_PREFIX}${session}`)
      .setLabel("End conversation")
      .setStyle(ButtonStyle.Secondary),
    optOutButton()
  );
}

function optInRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(OPT_IN_BUTTON_ID)
      .setLabel("Allow moderator DMs again")
      .setStyle(ButtonStyle.Secondary)
  );
}

function optOutConfirmRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(OPT_OUT_CONFIRM_ID)
      .setLabel("Yes, stop moderator DMs")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(OPT_OUT_CANCEL_ID)
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Secondary)
  );
}

function staffCloseRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(STAFF_CLOSE_BUTTON_ID)
      .setLabel("Close conversation")
      .setStyle(ButtonStyle.Danger)
  );
}

// The intro is the only embed; everything after it is plain text.
function buildIntroMessage(guild, session) {
  const serverName = guild?.name || "the server";
  const embed = new EmbedBuilder()
    .setColor(INTRO_EMBED_COLOR)
    .setTitle(`📩 The ${serverName} moderators would like to talk to you.`.slice(0, 256))
    .setDescription(
      [
        "A moderator will message you here. Just reply in this DM to respond — your messages go straight to the moderation team.",
        "",
        "You can end this conversation or stop moderator DMs at any time using the buttons below.",
      ].join("\n")
    );
  return {
    embeds: [embed],
    components: [introRow(session)],
    allowedMentions: NO_MENTIONS,
  };
}

function buildStaffOpener(user) {
  return {
    content: [
      `**Moderator DM** with ${user}`,
      `**User:** \`${user.username}\` (\`${user.id}\`)`,
      "",
      "Messages you send in this post are delivered to the user's DMs as plain text, without your name. Start a message with `.` to keep it staff-only.",
      "Close with `/close-dm` (optional reason) or the button below.",
    ].join("\n"),
    components: [staffCloseRow()],
    allowedMentions: NO_MENTIONS,
  };
}

function buildClosedDm(reason, optedOut) {
  const lines = ["🔒 **The moderators have closed this conversation.**"];
  if (reason) lines.push(`**Reason:** ${reason}`);
  lines.push(SUPPORT_HINT);
  return {
    content: lines.join("\n"),
    components: optedOut ? [] : [optOutRow()],
    allowedMentions: NO_MENTIONS,
  };
}

const OPTED_OUT_MESSAGE = [
  "🔕 **You've turned off moderator DMs.**",
  "Moderators can no longer start conversations with you through me. Modmail isn't affected — you can still message me for support anytime.",
  "Changed your mind? Use the button below.",
].join("\n");

// ---------------------------------------------------------------------------
// Thread helpers
// ---------------------------------------------------------------------------

async function sendThreadNotice(thread, content) {
  try {
    await modmail.ensureThreadWritable(thread);
    return await thread.send({ content, allowedMentions: NO_MENTIONS });
  } catch (err) {
    console.error("[mod-dm] Failed to post thread notice:", err);
    return null;
  }
}

/** Post a notice in a closed conversation's post, keeping it archived. */
async function sendClosedThreadNotice(client, threadId, content) {
  const thread = await fetchThread(client, threadId);
  if (!thread) return;
  const wasArchived = Boolean(thread.archived);
  await sendThreadNotice(thread, content);
  if (wasArchived) {
    await thread.setArchived(true, "Moderator DM notice").catch(() => {});
  }
}

async function setIntroComponents(client, doc, components) {
  if (!doc?.introMessageId) return;
  try {
    const user = await client.users.fetch(doc.userId);
    const dm = user.dmChannel ?? (await user.createDM());
    const intro = await dm.messages.fetch(doc.introMessageId);
    await intro.edit({ components });
  } catch {
    // Intro deleted or DMs closed — nothing to trim.
  }
}

// ---------------------------------------------------------------------------
// Open / close
// ---------------------------------------------------------------------------

/**
 * Mark a conversation CLOSED, post a notice in its forum post and archive it.
 * `thread`: undefined → fetch it; null → skip thread work.
 * Returns { closed: false } when another close already won the race.
 */
async function closeModDm(
  client,
  doc,
  {
    closedBy = "system",
    reason = null,
    thread,
    notice = null,
    archiveReason = "Moderator DM closed",
    notifyUser = false,
    trimIntro = true,
  } = {}
) {
  const result = await ModDm.updateOne(
    { _id: doc._id, status: "OPEN", session: doc.session },
    {
      $set: {
        status: "CLOSED",
        closedBy,
        closedAt: new Date(),
        closeReason: reason || null,
      },
    }
  );
  if (!result?.modifiedCount) return { closed: false };

  await modmail.deleteMessageLinks(doc.threadId);

  const target =
    thread === undefined ? await fetchThread(client, doc.threadId) : thread;
  let archiveError = null;
  if (target) {
    if (notice) await sendThreadNotice(target, notice);
    try {
      if (!target.archived) await target.setArchived(true, archiveReason);
    } catch (err) {
      console.error("[mod-dm] Failed to archive post:", err);
      archiveError = err;
    }
  }

  let userNotified = false;
  if (notifyUser) {
    try {
      const user = await client.users.fetch(doc.userId);
      await user.send(buildClosedDm(reason, Boolean(doc.optedOutAt)));
      userNotified = true;
    } catch {
      // User may have DMs closed; the conversation is still closed.
    }
  }

  if (trimIntro) {
    await setIntroComponents(client, doc, doc.optedOutAt ? [] : [optOutRow()]);
  }

  return {
    closed: true,
    archived: Boolean(target) && !archiveError,
    archiveError,
    userNotified,
  };
}

async function rollbackClaim(doc, { threadId } = {}) {
  const $set = {
    status: "CLOSED",
    closedBy: "system",
    closedAt: new Date(),
    closeReason: "Could not open conversation",
  };
  if (threadId !== undefined) $set.threadId = threadId;
  await ModDm.updateOne({ _id: doc._id, session: doc.session }, { $set }).catch(
    (err) => console.error("[mod-dm] Failed to roll back claim:", err)
  );
}

/**
 * Start (or reopen) a conversation. Returns { ok: true, thread, reused, initialMessageFailed }
 * or { ok: false, reason, ... } where reason is one of:
 * not_configured, bad_forum, clashes_with_modmail, bot, opted_out,
 * already_open, open_ticket, dms_closed.
 */
async function openModDm(client, { guild, target, moderator, initialMessage = null }) {
  const forumId = getModDmForumId();
  if (!forumId) return { ok: false, reason: "not_configured" };
  if (clashesWithModmail(forumId)) {
    return { ok: false, reason: "clashes_with_modmail" };
  }

  const forum = await client.channels.fetch(forumId).catch(() => null);
  if (!forum || forum.type !== ChannelType.GuildForum) {
    return { ok: false, reason: "bad_forum" };
  }

  if (target.bot) return { ok: false, reason: "bot" };

  const existing = await ModDm.findOne({ userId: target.id }).lean();
  if (existing?.optedOutAt) {
    return { ok: false, reason: "opted_out", optedOutAt: existing.optedOutAt };
  }
  if (existing?.status === "OPEN") {
    return { ok: false, reason: "already_open", threadId: existing.threadId };
  }

  const ticket = await modmail.findOpenTicketByUser(target.id);
  if (ticket) {
    return { ok: false, reason: "open_ticket", threadId: ticket.threadId };
  }

  // Atomic claim: the unique userId turns a concurrent open (or an opt-out
  // that landed in between) into a duplicate-key error on the upsert.
  let doc;
  try {
    doc = await ModDm.findOneAndUpdate(
      { userId: target.id, status: { $ne: "OPEN" }, optedOutAt: null },
      {
        $set: {
          status: "OPEN",
          openedBy: moderator.id,
          openedAt: new Date(),
          closedBy: null,
          closedAt: null,
          closeReason: null,
          introMessageId: null,
        },
        $setOnInsert: { guildId: guild.id },
        $inc: { session: 1 },
      },
      { upsert: true, new: true }
    );
  } catch (err) {
    if (err?.code !== 11000) throw err;
    const latest = await ModDm.findOne({ userId: target.id }).lean();
    if (latest?.optedOutAt) {
      return { ok: false, reason: "opted_out", optedOutAt: latest.optedOutAt };
    }
    return { ok: false, reason: "already_open", threadId: latest?.threadId };
  }

  // A modmail ticket may have been opened while we were claiming.
  const racedTicket = await modmail.findOpenTicketByUser(target.id);
  if (racedTicket) {
    await rollbackClaim(doc);
    return { ok: false, reason: "open_ticket", threadId: racedTicket.threadId };
  }

  const previousThreadId = doc.threadId;
  let thread = null;
  let reused = false;

  try {
    if (previousThreadId) {
      const old = await fetchThread(client, previousThreadId);
      if (old && old.parentId === forum.id) {
        thread = old;
        reused = true;
      }
    }

    if (!thread) {
      thread = await forum.threads.create({
        name: threadNameFor(target),
        message: buildStaffOpener(target),
        reason: `Moderator DM with ${target.tag} opened by ${moderator.tag}`,
      });
    }

    // Saved before the intro DM so a very fast user reply already finds the post.
    await ModDm.updateOne({ _id: doc._id }, { $set: { threadId: thread.id } });
  } catch (err) {
    await rollbackClaim(doc);
    throw err;
  }

  let intro;
  try {
    intro = await target.send(buildIntroMessage(guild, doc.session));
  } catch (err) {
    if (reused) {
      await rollbackClaim(doc);
      await sendClosedThreadNotice(
        client,
        thread.id,
        `⚠️ ${moderator} tried to reopen this conversation, but ${target}'s DMs are closed.`
      );
    } else {
      await rollbackClaim(doc, { threadId: previousThreadId });
      await thread.delete("Moderator DM could not be delivered").catch(() => {});
    }
    if (isDmClosedError(err)) return { ok: false, reason: "dms_closed" };
    throw err;
  }

  await ModDm.updateOne(
    { _id: doc._id, session: doc.session },
    { $set: { introMessageId: intro.id } }
  );
  await sendThreadNotice(
    thread,
    `🟢 **Conversation opened** by ${moderator} · ${timestamp()}`
  );

  let initialMessageFailed = false;
  if (initialMessage) {
    try {
      const dmMessage = await target.send({
        content: initialMessage,
        allowedMentions: NO_MENTIONS,
      });
      const echoChunks = splitMessageContent(
        `💬 **Sent by ${moderator} with \`/dm\`:**\n${initialMessage}`
      );
      let echo = null;
      for (const chunk of echoChunks) {
        const sent = await thread.send({ content: chunk, allowedMentions: NO_MENTIONS });
        echo = echo || sent;
      }
      await modmail.saveMessageLink({
        threadId: thread.id,
        dmMessageId: dmMessage.id,
        threadMessageId: echo?.id,
      });
    } catch (err) {
      console.error("[mod-dm] Failed to send initial message:", err);
      initialMessageFailed = true;
      await sendThreadNotice(
        thread,
        "⚠️ The first message from `/dm` couldn't be delivered. Send it again here."
      );
    }
  }

  return { ok: true, thread, reused, initialMessageFailed };
}

// ---------------------------------------------------------------------------
// Message routing (called from messageRouter)
// ---------------------------------------------------------------------------

/** DM from a user. Returns true when the user has an open mod DM (handled here). */
async function handleModDmUserMessage(client, message) {
  if (message.author.bot || message.guild) return false;

  const doc = await findOpenModDmByUser(message.author.id);
  if (!doc) return false;

  try {
    const thread = await fetchThreadUnlessDeleted(client, doc.threadId);
    if (!thread) {
      await closeModDm(client, doc, {
        closedBy: "system",
        reason: "Forum post was deleted",
        thread: null,
      });
      if (modmail.markMessageProcessed(message.id)) {
        await message.channel.send(
          `This conversation with the moderators has ended. ${SUPPORT_HINT}`
        );
      }
      return true;
    }

    if (!modmail.hasRelayableContent(message)) return true;
    if (!modmail.markMessageProcessed(message.id)) return true;

    await modmail.ensureThreadWritable(thread);
    const replyToMessageId = await modmail.resolveReplyMessageId(
      modmail.referencedMessageId(message),
      "dm"
    );
    const sent = await sendPlainRelay(thread, message, { replyToMessageId });
    await modmail.saveMessageLink({
      threadId: thread.id,
      dmMessageId: message.id,
      threadMessageId: sent?.id,
    });
  } catch (err) {
    console.error("[mod-dm] Failed to relay user DM:", err);
    await message.channel
      .send(
        "Sorry, I couldn't deliver your message to the moderators. Please try again in a moment."
      )
      .catch(() => {});
  }
  return true;
}

/** Message in the mod DM forum. Returns true for every post there so XP/sticky/rep skip it. */
async function handleModDmStaffReply(client, message) {
  if (message.author.bot || !message.guild) return false;
  if (
    !message.channel.isThread?.() ||
    !isModDmForumParent(message.channel.parentId)
  ) {
    return false;
  }

  const doc = await ModDm.findOne({ threadId: message.channel.id });
  if (!doc) return true;

  const content = message.content?.trim() || "";
  if (content.startsWith(modmail.NOTE_PREFIX)) return true;
  if (!modmail.hasRelayableContent(message)) return true;
  if (!modmail.markMessageProcessed(message.id)) return true;

  if (doc.status !== "OPEN") {
    await message
      .reply({
        content:
          "⚠️ Not delivered — this conversation is closed. Run `/dm` to reopen it.",
        allowedMentions: { parse: [], repliedUser: false },
      })
      .catch(() => {});
    return true;
  }

  try {
    await modmail.ensureThreadWritable(message.channel);
    const user = await client.users.fetch(doc.userId);
    const replyToMessageId = await modmail.resolveReplyMessageId(
      modmail.referencedMessageId(message),
      "thread"
    );
    const sent = await sendPlainRelay(user, message, { replyToMessageId });
    await modmail.saveMessageLink({
      threadId: message.channel.id,
      threadMessageId: message.id,
      dmMessageId: sent?.id,
    });
  } catch (err) {
    if (isDmClosedError(err)) {
      await message
        .reply({
          content: `⚠️ **Not delivered** — <@${doc.userId}>'s DMs are now closed (they blocked the bot, changed their privacy settings, or left the server). This conversation has been closed; run \`/dm\` to try again later.`,
          allowedMentions: { parse: [], repliedUser: false },
        })
        .catch(() => {});
      await closeModDm(client, doc, {
        closedBy: "system",
        reason: "User's DMs are closed",
        thread: message.channel,
        archiveReason: "User's DMs are closed",
        trimIntro: false,
      });
      return true;
    }

    console.error("[mod-dm] Failed to DM user:", err);
    await message
      .reply({
        content: "⚠️ Couldn't deliver that message. Please try again.",
        allowedMentions: { parse: [], repliedUser: false },
      })
      .catch(() => {});
  }

  return true;
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

function memberRoleIds(member) {
  const roles = member?.roles;
  if (!roles) return [];
  if (Array.isArray(roles)) return roles;
  return roles.cache ? [...roles.cache.keys()] : [];
}

function canCloseFromButton(interaction) {
  const allowed = getCommandAllowedRoleIds("close-dm");
  if (allowed && allowed.length) {
    const roleIds = memberRoleIds(interaction.member);
    return roleIds.some((id) => allowed.includes(id));
  }
  return Boolean(
    interaction.memberPermissions?.has(PermissionFlagsBits.ModerateMembers)
  );
}

async function handleEndButton(client, interaction) {
  const session = Number(interaction.customId.slice(END_BUTTON_PREFIX.length));
  await interaction.deferUpdate();

  const doc = await ModDm.findOne({ userId: interaction.user.id });
  const isCurrent =
    doc && doc.status === "OPEN" && Number(doc.session) === session;

  const result = isCurrent
    ? await closeModDm(client, doc, {
        closedBy: interaction.user.id,
        notice: `🔒 **${interaction.user} ended the conversation.**`,
        archiveReason: "User ended the conversation",
        trimIntro: false,
      })
    : { closed: false };

  await interaction
    .editReply({ components: doc?.optedOutAt ? [] : [optOutRow()] })
    .catch(() => {});

  await interaction.followUp(
    result.closed
      ? {
          content: `✅ **Conversation ended.** The moderators have been notified. ${SUPPORT_HINT}`,
        }
      : { content: "This conversation has already ended.", ephemeral: true }
  );
}

async function handleOptOutButton(interaction) {
  const doc = await ModDm.findOne({ userId: interaction.user.id }).lean();
  if (doc?.optedOutAt) {
    return interaction.reply({
      content: "You've already turned off moderator DMs.",
      components: [optInRow()],
      ephemeral: true,
    });
  }
  return interaction.reply({
    content: [
      "**Stop moderator DMs?**",
      "Moderators won't be able to start conversations with you through me, and any open conversation will end. Modmail isn't affected, and you can undo this anytime.",
    ].join("\n"),
    components: [optOutConfirmRow()],
    ephemeral: true,
  });
}

async function handleOptOutConfirm(client, interaction) {
  await interaction.deferUpdate();
  const userId = interaction.user.id;
  const now = new Date();

  let doc = await ModDm.findOneAndUpdate(
    { userId, optedOutAt: null },
    { $set: { optedOutAt: now } },
    { new: true }
  );
  if (!doc) {
    if (await ModDm.exists({ userId })) {
      await interaction.editReply({
        content: "You've already turned off moderator DMs.",
        components: [],
      });
      return;
    }
    doc = await ModDm.create({ userId, guildId: defaultGuildId(), optedOutAt: now });
  }

  if (doc.status === "OPEN") {
    await closeModDm(client, doc, {
      closedBy: userId,
      reason: "User turned off moderator DMs",
      notice: `🔕 **${interaction.user} ended the conversation and turned off moderator DMs.**`,
      archiveReason: "User turned off moderator DMs",
    });
  } else {
    await setIntroComponents(client, doc, []);
    await sendClosedThreadNotice(
      client,
      doc.threadId,
      `🔕 **${interaction.user} turned off moderator DMs.**`
    );
  }

  await interaction.editReply({
    content: "Done — moderator DMs are turned off.",
    components: [],
  });
  await interaction.followUp({ content: OPTED_OUT_MESSAGE, components: [optInRow()] });
}

async function handleOptOutCancel(interaction) {
  return interaction.update({
    content: "No changes made — moderator DMs are still on.",
    components: [],
  });
}

async function handleOptIn(client, interaction) {
  await interaction.deferUpdate();
  const doc = await ModDm.findOneAndUpdate(
    { userId: interaction.user.id, optedOutAt: { $ne: null } },
    { $set: { optedOutAt: null } },
    { new: true }
  );

  if (!doc) {
    await interaction.editReply({
      content: "Moderator DMs are already on.",
      components: [],
    });
    return;
  }

  await sendClosedThreadNotice(
    client,
    doc.threadId,
    `🔔 **${interaction.user} turned moderator DMs back on.**`
  );
  await interaction.editReply({
    content:
      "🔔 **Moderator DMs are back on.** Moderators can message you through me again, and you can turn this off from their next message anytime.",
    components: [],
  });
}

async function handleStaffCloseButton(client, interaction) {
  if (!interaction.inGuild()) return;

  if (!canCloseFromButton(interaction)) {
    return interaction.reply({
      content: "❌ You do not have permission to close this conversation.",
      ephemeral: true,
    });
  }

  const doc = await ModDm.findOne({
    threadId: interaction.channelId,
    status: "OPEN",
  });
  if (!doc) {
    return interaction.reply({
      content: "This conversation is already closed. Run `/dm` to reopen it.",
      ephemeral: true,
    });
  }

  await interaction.deferReply({ ephemeral: true });
  const result = await closeModDm(client, doc, {
    closedBy: interaction.user.id,
    thread: interaction.channel ?? undefined,
    notice: `🔒 **Conversation closed** by ${interaction.user}.`,
    archiveReason: `Moderator DM closed by ${interaction.user.tag}`,
    notifyUser: true,
  });

  return interaction.editReply({ content: closeResultMessage(result) });
}

function closeResultMessage(result) {
  if (!result.closed) return "This conversation is already closed.";
  const parts = [
    result.archiveError
      ? "Conversation closed, but I couldn't archive this post — please archive it manually."
      : "Conversation closed and the post archived.",
  ];
  if (!result.userNotified) {
    parts.push("The user couldn't be notified (their DMs may be closed).");
  }
  return parts.join(" ");
}

async function handleButton(client, interaction) {
  const id = interaction.customId;
  if (id.startsWith(END_BUTTON_PREFIX)) return handleEndButton(client, interaction);
  if (id === OPT_OUT_BUTTON_ID) return handleOptOutButton(interaction);
  if (id === OPT_OUT_CONFIRM_ID) return handleOptOutConfirm(client, interaction);
  if (id === OPT_OUT_CANCEL_ID) return handleOptOutCancel(interaction);
  if (id === OPT_IN_BUTTON_ID) return handleOptIn(client, interaction);
  if (id === STAFF_CLOSE_BUTTON_ID) return handleStaffCloseButton(client, interaction);
  return undefined;
}

function modDmSystem(client) {
  const forumId = getModDmForumId();
  if (!forumId) {
    console.warn(
      '[mod-dm] Forum channel is not set (Channels key "modDm" or MOD_DM_CHANNEL_ID) — /dm will fail until configured.'
    );
  } else if (clashesWithModmail(forumId)) {
    console.warn(
      "[mod-dm] The modDm forum is the same channel as a modmail forum — /dm is disabled until it points to a separate forum."
    );
  }

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isButton() || !interaction.customId.startsWith(BUTTON_PREFIX)) {
      return;
    }

    try {
      await handleButton(client, interaction);
    } catch (err) {
      console.error("[mod-dm] Button handler failed:", err);
      const payload = {
        content: "Something went wrong. Please try again.",
        ephemeral: true,
      };
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp(payload).catch(() => {});
      } else {
        await interaction.reply(payload).catch(() => {});
      }
    }
  });

  return {
    handleModDmUserMessage: (message) => handleModDmUserMessage(client, message),
    handleModDmStaffReply: (message) => handleModDmStaffReply(client, message),
  };
}

modDmSystem.getModDmForumId = getModDmForumId;
modDmSystem.isModDmForumParent = isModDmForumParent;
modDmSystem.isDmClosedError = isDmClosedError;
modDmSystem.findOpenModDmByUser = findOpenModDmByUser;
modDmSystem.openModDm = openModDm;
modDmSystem.closeModDm = closeModDm;
modDmSystem.closeResultMessage = closeResultMessage;
modDmSystem.sendPlainRelay = sendPlainRelay;
modDmSystem.splitMessageContent = splitMessageContent;
modDmSystem.buildPlainRelayText = buildPlainRelayText;
modDmSystem.handleModDmUserMessage = handleModDmUserMessage;
modDmSystem.handleModDmStaffReply = handleModDmStaffReply;
modDmSystem.handleButton = handleButton;
modDmSystem.END_BUTTON_PREFIX = END_BUTTON_PREFIX;

module.exports = modDmSystem;
