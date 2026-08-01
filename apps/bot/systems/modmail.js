const {
  ChannelType,
  EmbedBuilder,
} = require("discord.js");
const { ModmailTicket } = require("@ralevel/db");

const STAFF_EMBED_COLOR = 0x5865f2;
const USER_EMBED_COLOR = 0x57f287;
const NOTE_PREFIX = ".";

function getModMailChannelId() {
  return process.env.MOD_MAIL_CHANNEL_ID || null;
}

function threadNameFor(user) {
  const raw = String(user.username || "user")
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, "")
    .slice(0, 80);
  return `modmail-${raw || user.id}`.slice(0, 100);
}

function attachmentLines(message) {
  if (!message.attachments?.size) return [];
  return [...message.attachments.values()].map((a) => a.url);
}

function hasRelayableContent(message) {
  return Boolean(message.content?.trim()) || Boolean(message.attachments?.size);
}

function buildUserRelayEmbed(message) {
  const embed = new EmbedBuilder()
    .setColor(USER_EMBED_COLOR)
    .setAuthor({
      name: message.author.tag,
      iconURL: message.author.displayAvatarURL({ size: 128 }),
    })
    .setFooter({ text: `User ID: ${message.author.id}` })
    .setTimestamp(message.createdAt);

  if (message.content?.trim()) {
    embed.setDescription(message.content.trim());
  }

  const urls = attachmentLines(message);
  if (urls.length) {
    embed.addFields({
      name: "Attachments",
      value: urls.map((url) => `[link](${url})`).join("\n").slice(0, 1024),
    });
  }

  return embed;
}

function buildStaffRelayEmbed(message) {
  const embed = new EmbedBuilder()
    .setColor(STAFF_EMBED_COLOR)
    .setAuthor({ name: "Staff" })
    .setTimestamp(message.createdAt);

  if (message.content?.trim()) {
    embed.setDescription(message.content.trim());
  }

  const urls = attachmentLines(message);
  if (urls.length) {
    embed.addFields({
      name: "Attachments",
      value: urls.map((url) => `[link](${url})`).join("\n").slice(0, 1024),
    });
  }

  return embed;
}

function buildOpenerEmbed(user) {
  return new EmbedBuilder()
    .setColor(STAFF_EMBED_COLOR)
    .setTitle("Modmail")
    .setDescription(
      "Messages here are relayed anonymously to the user via DM.\n" +
        `Prefix a message with \`${NOTE_PREFIX}\` to keep it staff-only.`
    )
    .addFields(
      { name: "User", value: `${user} (\`${user.tag}\`)`, inline: true },
      { name: "User ID", value: user.id, inline: true }
    )
    .setTimestamp();
}

async function ensureThreadWritable(thread) {
  if (thread.archived) {
    await thread.setArchived(false);
  }
}

async function isModmailThread(threadId) {
  if (!threadId) return false;
  const ticket = await ModmailTicket.findOne({ threadId })
    .select("_id")
    .lean();
  return Boolean(ticket);
}

async function findTicketByUser(userId) {
  return ModmailTicket.findOne({ userId });
}

async function findTicketByThread(threadId) {
  return ModmailTicket.findOne({ threadId });
}

async function createModmailThread(client, user) {
  const forumId = getModMailChannelId();
  if (!forumId) {
    throw new Error("MOD_MAIL_CHANNEL_ID is not configured");
  }

  const forum = await client.channels.fetch(forumId);
  if (!forum || forum.type !== ChannelType.GuildForum) {
    throw new Error("MOD_MAIL_CHANNEL_ID must be a forum channel");
  }

  const thread = await forum.threads.create({
    name: threadNameFor(user),
    message: {
      embeds: [buildOpenerEmbed(user)],
    },
    reason: `Modmail thread for ${user.tag}`,
  });

  const ticket = await ModmailTicket.findOneAndUpdate(
    { userId: user.id },
    {
      userId: user.id,
      threadId: thread.id,
      guildId: forum.guildId,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return { thread, ticket };
}

async function resolveThreadForUser(client, user) {
  let ticket = await findTicketByUser(user.id);
  let thread = null;
  let isNew = false;

  if (ticket) {
    thread = await client.channels.fetch(ticket.threadId).catch(() => null);
    if (!thread) {
      const created = await createModmailThread(client, user);
      thread = created.thread;
      ticket = created.ticket;
      isNew = true;
    }
  } else {
    const created = await createModmailThread(client, user);
    thread = created.thread;
    ticket = created.ticket;
    isNew = true;
  }

  await ensureThreadWritable(thread);
  return { thread, ticket, isNew };
}

async function handleModmailDm(client, message) {
  if (message.author.bot || message.guild) return;
  if (!hasRelayableContent(message)) return;

  try {
    const { thread, isNew } = await resolveThreadForUser(
      client,
      message.author
    );

    await thread.send({ embeds: [buildUserRelayEmbed(message)] });

    if (isNew) {
      await message.channel
        .send(
          "Your message was sent to staff. They will reply here."
        )
        .catch(() => {});
    }
  } catch (err) {
    console.error("[modmail] Failed to handle DM:", err);
    await message.channel
      .send(
        "Sorry, I couldn't send your message right now. Please try again later."
      )
      .catch(() => {});
  }
}

async function handleModmailStaffReply(client, message) {
  if (message.author.bot || !message.guild) return false;

  const forumId = getModMailChannelId();
  if (
    !forumId ||
    !message.channel.isThread?.() ||
    message.channel.parentId !== forumId
  ) {
    return false;
  }

  const ticket = await findTicketByThread(message.channel.id);
  if (!ticket) return false;

  if (!hasRelayableContent(message)) return true;

  const content = message.content?.trim() || "";
  if (content.startsWith(NOTE_PREFIX)) return true;

  try {
    await ensureThreadWritable(message.channel);
    const user = await client.users.fetch(ticket.userId);
    await user.send({ embeds: [buildStaffRelayEmbed(message)] });
  } catch (err) {
    console.error("[modmail] Failed to DM user:", err);
    await message.channel
      .send(
        "Could not deliver that message — the user may have DMs closed."
      )
      .catch(() => {});
  }

  return true;
}

module.exports = function modmailSystem(client) {
  return {
    handleModmailDm: (message) => handleModmailDm(client, message),
    handleModmailStaffReply: (message) =>
      handleModmailStaffReply(client, message),
    isModmailThread,
  };
};
