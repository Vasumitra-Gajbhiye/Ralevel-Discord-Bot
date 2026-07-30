const {
  ChannelType,
  EmbedBuilder,
} = require("discord.js");
const { ModmailTicket } = require("@ralevel/db");

const STAFF_EMBED_COLOR = 0x5865f2;
const USER_EMBED_COLOR = 0x57f287;
const NOTE_PREFIX = ".";

function getTicketCategoryId() {
  return process.env.TICKET_CATEGORY_ID || null;
}

function getGuildId() {
  return process.env.GUILD_ID || null;
}

function channelNameFor(user) {
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

async function isOpenTicketChannel(channelId) {
  if (!channelId) return false;
  const ticket = await ModmailTicket.findOne({
    channelId,
    status: "OPEN",
  })
    .select("_id")
    .lean();
  return Boolean(ticket);
}

async function findOpenTicketByUser(userId) {
  return ModmailTicket.findOne({ userId, status: "OPEN" });
}

async function findOpenTicketByChannel(channelId) {
  return ModmailTicket.findOne({ channelId, status: "OPEN" });
}

async function createTicketChannel(client, user) {
  const guildId = getGuildId();
  const categoryId = getTicketCategoryId();

  if (!guildId) {
    throw new Error("GUILD_ID is not configured");
  }
  if (!categoryId) {
    throw new Error("TICKET_CATEGORY_ID is not configured");
  }

  const guild = await client.guilds.fetch(guildId);
  const channel = await guild.channels.create({
    name: channelNameFor(user),
    type: ChannelType.GuildText,
    parent: categoryId,
    topic: `Modmail with ${user.tag} (${user.id})`,
    reason: `Modmail ticket for ${user.tag}`,
  });

  const ticket = await ModmailTicket.create({
    userId: user.id,
    channelId: channel.id,
    guildId: guild.id,
    status: "OPEN",
  });

  const opener = new EmbedBuilder()
    .setColor(STAFF_EMBED_COLOR)
    .setTitle("New Modmail Ticket")
    .setDescription(
      "Messages here are relayed anonymously to the user via DM.\n" +
        `Prefix a message with \`${NOTE_PREFIX}\` to keep it staff-only.`
    )
    .addFields(
      { name: "User", value: `${user} (\`${user.tag}\`)`, inline: true },
      { name: "User ID", value: user.id, inline: true }
    )
    .setTimestamp();

  await channel.send({ embeds: [opener] });

  return { channel, ticket };
}

async function handleModmailDm(client, message) {
  if (message.author.bot || message.guild) return;
  if (!hasRelayableContent(message)) return;

  try {
    let ticket = await findOpenTicketByUser(message.author.id);
    let channel;
    let isNew = false;

    if (ticket) {
      channel = await client.channels.fetch(ticket.channelId).catch(() => null);
      if (!channel) {
        ticket.status = "CLOSED";
        ticket.closedAt = new Date();
        ticket.closedBy = "system";
        await ticket.save();
        ticket = null;
      }
    }

    if (!ticket) {
      const created = await createTicketChannel(client, message.author);
      channel = created.channel;
      ticket = created.ticket;
      isNew = true;
    }

    await channel.send({ embeds: [buildUserRelayEmbed(message)] });

    if (isNew) {
      await message.channel
        .send(
          "Your ticket has been created. Staff will reply here — please keep this DM open."
        )
        .catch(() => {});
    }
  } catch (err) {
    console.error("[modmail] Failed to handle DM:", err);
    await message.channel
      .send(
        "Sorry, I couldn't open a ticket right now. Please try again later."
      )
      .catch(() => {});
  }
}

async function handleModmailStaffReply(client, message) {
  if (message.author.bot || !message.guild) return false;

  const categoryId = getTicketCategoryId();
  if (!categoryId || message.channel.parentId !== categoryId) {
    return false;
  }

  const ticket = await findOpenTicketByChannel(message.channel.id);
  if (!ticket) return false;

  if (!hasRelayableContent(message)) return true;

  const content = message.content?.trim() || "";
  if (content.startsWith(NOTE_PREFIX)) return true;

  try {
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
    isOpenTicketChannel,
  };
};
