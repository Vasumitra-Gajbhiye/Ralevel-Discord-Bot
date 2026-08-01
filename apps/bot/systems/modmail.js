const {
  ActionRowBuilder,
  ChannelType,
  EmbedBuilder,
  Events,
  ModalBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");
const { ModmailTicket, DEFAULT_MODMAIL_CATEGORIES } = require("@ralevel/db");
const { tryGetGuildConfig, getRoleId } = require("../utils/guildConfigStore");

const STAFF_EMBED_COLOR = 0x5865f2;
const USER_EMBED_COLOR = 0x57f287;
const NOTE_PREFIX = ".";

const SELECT_CUSTOM_ID = "modmail_category";
const MODAL_CUSTOM_ID_PREFIX = "modmail_modal:";
const DESCRIPTION_INPUT_ID = "modmail_description";

const FALLBACK_CATEGORIES =
  Array.isArray(DEFAULT_MODMAIL_CATEGORIES) && DEFAULT_MODMAIL_CATEGORIES.length
    ? DEFAULT_MODMAIL_CATEGORIES
    : [
        {
          value: "general",
          label: "General Query",
          description: "Questions that don't fit the other options",
        },
        {
          value: "advertise",
          label: "Permission to Advertise",
          description: "Request permission to advertise",
        },
        {
          value: "report",
          label: "Report a Member",
          description: "Report a member for misconduct",
        },
      ];

function getModMailChannelId() {
  const fromConfig = tryGetGuildConfig()?.modmail?.forumChannelId;
  if (typeof fromConfig === "string" && fromConfig.trim()) {
    return fromConfig.trim();
  }
  return process.env.MOD_MAIL_CHANNEL_ID || null;
}

function getModmailCategories() {
  const raw = tryGetGuildConfig()?.modmail?.categories;
  if (!Array.isArray(raw) || raw.length === 0) {
    return FALLBACK_CATEGORIES.map((c) => ({ ...c }));
  }

  const cleaned = raw
    .map((c) => ({
      value: String(c?.value ?? "").trim(),
      label: String(c?.label ?? "").trim(),
      description: String(c?.description ?? "").trim(),
    }))
    .filter((c) => c.value && c.label)
    .slice(0, 25);

  return cleaned.length
    ? cleaned
    : FALLBACK_CATEGORIES.map((c) => ({ ...c }));
}

function categoryLabel(category) {
  const match = getModmailCategories().find((c) => c.value === category);
  return match?.label || category;
}

function isValidCategory(category) {
  return getModmailCategories().some((c) => c.value === category);
}

function getBoosterRoleId() {
  return getRoleId("booster") || process.env.BOOSTER_ROLE_ID || null;
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

function buildDescriptionEmbed(user, description) {
  return new EmbedBuilder()
    .setColor(USER_EMBED_COLOR)
    .setAuthor({
      name: user.tag,
      iconURL: user.displayAvatarURL({ size: 128 }),
    })
    .setDescription(description.slice(0, 4096))
    .setFooter({ text: `User ID: ${user.id}` })
    .setTimestamp();
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

function buildOpenerEmbed(user, category) {
  return new EmbedBuilder()
    .setColor(STAFF_EMBED_COLOR)
    .setTitle("Modmail")
    .setDescription(
      "Messages here are relayed anonymously to the user via DM.\n" +
        `Prefix a message with \`${NOTE_PREFIX}\` to keep it staff-only.`
    )
    .addFields(
      { name: "User", value: `${user} (\`${user.tag}\`)`, inline: true },
      { name: "User ID", value: user.id, inline: true },
      { name: "Category", value: categoryLabel(category), inline: true }
    )
    .setTimestamp();
}

function buildSupportMenuMessage() {
  const boosterRoleId = getBoosterRoleId();
  const boosterText = boosterRoleId
    ? `<@&${boosterRoleId}>`
    : "r/alevel Booster";

  const embed = new EmbedBuilder()
    .setColor(STAFF_EMBED_COLOR)
    .setTitle("GET SUPPORT")
    .setDescription(
      [
        "Please select the most relevant option below to open a Support Ticket!",
        "",
        `⭐ If you're a ${boosterText}, you'll receive Priority Support!`,
        "",
        "❗ Misuse of this system will result in infractions.",
      ].join("\n")
    );

  const select = new StringSelectMenuBuilder()
    .setCustomId(SELECT_CUSTOM_ID)
    .setPlaceholder("Select a support category")
    .addOptions(
      getModmailCategories().map((category) => {
        const option = new StringSelectMenuOptionBuilder()
          .setLabel(category.label.slice(0, 100))
          .setValue(category.value.slice(0, 100));
        if (category.description) {
          option.setDescription(category.description.slice(0, 100));
        }
        return option;
      })
    );

  return {
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(select)],
  };
}

async function ensureThreadWritable(thread) {
  if (thread.archived) {
    await thread.setArchived(false);
  }
}

async function findOpenTicketByUser(userId) {
  return ModmailTicket.findOne({ userId, status: "OPEN" });
}

async function findOpenTicketByThread(threadId) {
  return ModmailTicket.findOne({ threadId, status: "OPEN" });
}

async function closeTicketAsSystem(ticket) {
  // Use updateOne so legacy docs (missing threadId/category) still close
  // without failing full-document validation.
  await ModmailTicket.updateOne(
    { _id: ticket._id },
    {
      $set: {
        status: "CLOSED",
        closedAt: new Date(),
        closedBy: "system",
      },
    }
  );
}

async function createModmailThread(client, user, category, description) {
  const forumId = getModMailChannelId();
  if (!forumId) {
    throw new Error("Modmail forum channel is not configured");
  }

  const forum = await client.channels.fetch(forumId);
  if (!forum || forum.type !== ChannelType.GuildForum) {
    throw new Error("Modmail forum channel must be a Discord forum channel");
  }

  async function createOnce() {
    let thread;
    try {
      thread = await forum.threads.create({
        name: threadNameFor(user),
        message: {
          embeds: [buildOpenerEmbed(user, category)],
        },
        reason: `Modmail thread for ${user.tag} (${category})`,
      });

      await thread.send({ embeds: [buildDescriptionEmbed(user, description)] });

      const ticket = await ModmailTicket.create({
        userId: user.id,
        threadId: thread.id,
        guildId: forum.guildId,
        category,
        status: "OPEN",
      });

      return { thread, ticket };
    } catch (err) {
      // Avoid leaving orphan forum posts if DB insert fails.
      if (thread) {
        await thread.delete("Modmail ticket DB create failed").catch(() => {});
      }
      throw err;
    }
  }

  try {
    return await createOnce();
  } catch (err) {
    // Legacy unique index on channelId (null) — repair and retry once.
    if (err?.code === 11000 && typeof ModmailTicket.ensureModmailIndexes === "function") {
      console.warn(
        "[modmail] Duplicate key on ticket create; repairing indexes and retrying once."
      );
      await ModmailTicket.ensureModmailIndexes();
      return await createOnce();
    }
    throw err;
  }
}

async function sendSupportMenu(channel) {
  await channel.send(buildSupportMenuMessage());
}

async function handleModmailDm(client, message) {
  if (message.author.bot || message.guild) return;

  try {
    let ticket = await findOpenTicketByUser(message.author.id);

    if (ticket) {
      const thread = await client.channels
        .fetch(ticket.threadId)
        .catch(() => null);

      if (!thread) {
        await closeTicketAsSystem(ticket);
        ticket = null;
      } else {
        if (!hasRelayableContent(message)) return;
        await ensureThreadWritable(thread);
        await thread.send({ embeds: [buildUserRelayEmbed(message)] });
        return;
      }
    }

    // No open ticket — show intake menu (any non-bot DM triggers it)
    await sendSupportMenu(message.channel);
  } catch (err) {
    console.error("[modmail] Failed to handle DM:", err);
    await message.channel
      .send(
        "Sorry, I couldn't process your message right now. Please try again later."
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

  const openTicket = await findOpenTicketByThread(message.channel.id);
  if (!openTicket) {
    // Still claim closed/unknown modmail forum posts so XP/sticky/rep skip them.
    const anyTicket = await ModmailTicket.findOne({
      threadId: message.channel.id,
    })
      .select("_id")
      .lean();
    return Boolean(anyTicket);
  }

  if (!hasRelayableContent(message)) return true;

  const content = message.content?.trim() || "";
  if (content.startsWith(NOTE_PREFIX)) return true;

  try {
    await ensureThreadWritable(message.channel);
    const user = await client.users.fetch(openTicket.userId);
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

async function handleCategorySelect(interaction) {
  const category = interaction.values?.[0];
  if (!isValidCategory(category)) {
    return interaction.reply({
      content: "Invalid category selected. Please try again.",
      ephemeral: true,
    });
  }

  const existing = await findOpenTicketByUser(interaction.user.id);
  if (existing) {
    return interaction.reply({
      content:
        "You already have an open support ticket. Reply in this DM to continue that conversation.",
      ephemeral: true,
    });
  }

  const modal = new ModalBuilder()
    .setCustomId(`${MODAL_CUSTOM_ID_PREFIX}${category}`)
    .setTitle("Describe your problem");

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId(DESCRIPTION_INPUT_ID)
        .setLabel("Describe your problem")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMinLength(10)
        .setMaxLength(4000)
    )
  );

  return interaction.showModal(modal);
}

async function handleModalSubmit(client, interaction) {
  const category = interaction.customId.slice(MODAL_CUSTOM_ID_PREFIX.length);
  if (!isValidCategory(category)) {
    return interaction.reply({
      content: "Invalid ticket category. Please start again by DMing me.",
      ephemeral: true,
    });
  }

  const description = interaction.fields
    .getTextInputValue(DESCRIPTION_INPUT_ID)
    ?.trim();

  if (!description) {
    return interaction.reply({
      content: "Please provide a description of your problem.",
      ephemeral: true,
    });
  }

  const existing = await findOpenTicketByUser(interaction.user.id);
  if (existing) {
    return interaction.reply({
      content:
        "You already have an open support ticket. Reply in this DM to continue that conversation.",
      ephemeral: true,
    });
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    await createModmailThread(
      client,
      interaction.user,
      category,
      description
    );

    await interaction.editReply({
      content:
        "Your support ticket has been opened. Staff will reply here — please keep this DM open.",
    });
  } catch (err) {
    console.error("[modmail] Failed to create ticket from modal:", err);
    await interaction.editReply({
      content:
        "Sorry, I couldn't open your ticket right now. Please try again later.",
    });
  }
}

module.exports = function modmailSystem(client) {
  if (!getModMailChannelId()) {
    console.warn(
      "[modmail] Forum channel is not set in guild config (or MOD_MAIL_CHANNEL_ID) — ticket creation will fail until configured."
    );
  }

  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (
        interaction.isStringSelectMenu() &&
        interaction.customId === SELECT_CUSTOM_ID
      ) {
        await handleCategorySelect(interaction);
        return;
      }

      if (
        interaction.isModalSubmit() &&
        interaction.customId.startsWith(MODAL_CUSTOM_ID_PREFIX)
      ) {
        await handleModalSubmit(client, interaction);
      }
    } catch (err) {
      console.error("[modmail] Interaction handler failed:", err);
      if (interaction.deferred || interaction.replied) {
        await interaction
          .followUp({
            content: "Something went wrong. Please try again.",
            ephemeral: true,
          })
          .catch(() => {});
      } else {
        await interaction
          .reply({
            content: "Something went wrong. Please try again.",
            ephemeral: true,
          })
          .catch(() => {});
      }
    }
  });

  return {
    handleModmailDm: (message) => handleModmailDm(client, message),
    handleModmailStaffReply: (message) =>
      handleModmailStaffReply(client, message),
  };
};
