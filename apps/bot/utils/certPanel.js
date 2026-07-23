const { GuildConfig } = require("@ralevel/db");
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
} = require("discord.js");
const {
  getGuildConfig,
  tryGetGuildConfig,
  setGuildConfig,
  toPlainConfig,
} = require("./guildConfigStore");

const BUTTON_STYLE_MAP = {
  Primary: ButtonStyle.Primary,
  Secondary: ButtonStyle.Secondary,
  Success: ButtonStyle.Success,
  Danger: ButtonStyle.Danger,
};

const SEND_OPTIONS = { allowedMentions: { parse: [] } };

function getCertPanelConfig(config = tryGetGuildConfig()) {
  return config?.certificates?.panel || {};
}

function getCertTypeLabel(certTypeId, config = tryGetGuildConfig()) {
  const type = (config?.certificates?.types || []).find(
    (entry) => entry.id === certTypeId,
  );
  return type?.label || certTypeId;
}

function getCertTypeIdFromCustomId(customId) {
  if (!customId?.startsWith("apply_")) return null;
  return customId.slice("apply_".length);
}

function isCertPanelMessage(message, botUserId) {
  if (!message || message.author?.id !== botUserId) return false;

  const storedId = getCertPanelConfig().panelMessageId;
  if (storedId && message.id === storedId) return true;

  for (const row of message.components || []) {
    for (const component of row.components || []) {
      if (component.customId?.startsWith("apply_")) {
        return true;
      }
    }
  }

  return false;
}

function buildCertPanelPayload(config = getGuildConfig()) {
  const panel = config.certificates?.panel || {};
  const buttons = Array.isArray(panel.buttons) ? panel.buttons : [];

  const embed = new EmbedBuilder()
    .setTitle(panel.title || "Certificate Application")
    .setDescription(panel.description || "")
    .setColor(panel.color || "#2CDAF2");

  if (panel.footer) {
    embed.setFooter({ text: panel.footer });
  }

  if (panel.showTimestamp !== false) {
    embed.setTimestamp();
  }

  const rows = [];
  for (let i = 0; i < buttons.length; i += 5) {
    const chunk = buttons.slice(i, i + 5);
    if (!chunk.length) continue;

    const row = new ActionRowBuilder();
    for (const button of chunk) {
      if (!button?.certTypeId || !button?.label) continue;
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`apply_${button.certTypeId}`)
          .setLabel(button.label)
          .setStyle(BUTTON_STYLE_MAP[button.style] || ButtonStyle.Primary),
      );
    }

    if (row.components.length) {
      rows.push(row);
    }
  }

  return {
    embeds: [embed],
    components: rows,
    ...SEND_OPTIONS,
  };
}

async function persistPanelMessageId(messageId, guildId) {
  const resolvedGuildId = guildId || process.env.GUILD_ID;
  if (!resolvedGuildId) return;

  await GuildConfig.updateOne(
    { guildId: resolvedGuildId },
    { $set: { "certificates.panel.panelMessageId": messageId } },
  );

  const cached = tryGetGuildConfig();
  if (cached) {
    cached.certificates = cached.certificates || {};
    cached.certificates.panel = cached.certificates.panel || {};
    cached.certificates.panel.panelMessageId = messageId;
    setGuildConfig(cached);
  }
}

async function deleteCertPanelMessages(channel, botUserId) {
  const panel = getCertPanelConfig();
  const storedId = panel.panelMessageId;
  const toDelete = new Set();

  if (storedId) {
    toDelete.add(storedId);
  }

  const recent = await channel.messages.fetch({ limit: 100 }).catch(() => null);
  if (recent) {
    for (const [, message] of recent) {
      if (isCertPanelMessage(message, botUserId)) {
        toDelete.add(message.id);
      }
    }
  }

  for (const messageId of toDelete) {
    try {
      await channel.messages.delete(messageId);
    } catch (error) {
      if (error.code !== 10008) {
        console.warn(
          `[CertPanel] Failed to delete message ${messageId}:`,
          error.message,
        );
      }
    }
  }
}

/**
 * Delete old certificate panel messages and post a fresh panel in the configured channel.
 */
async function syncCertPanel(client) {
  const cfg = tryGetGuildConfig();
  if (cfg?.features?.certificates === false) {
    console.log("[CertPanel] Certificates feature disabled; skipping panel sync.");
    return { ok: false, reason: "feature_disabled" };
  }

  const panel = getCertPanelConfig(cfg);
  const channelId = panel.channelId;
  if (!channelId) {
    console.log("[CertPanel] No panel channel configured; skipping sync.");
    return { ok: false, reason: "no_channel" };
  }

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased()) {
    console.warn(`[CertPanel] Channel ${channelId} is missing or not text-based.`);
    return { ok: false, reason: "invalid_channel" };
  }

  const perms = channel.permissionsFor(client.user);
  if (
    !perms?.has([
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.EmbedLinks,
    ])
  ) {
    console.warn(
      `[CertPanel] Missing permissions in channel ${channelId} (need ViewChannel, SendMessages, EmbedLinks).`,
    );
    return { ok: false, reason: "missing_permissions" };
  }

  const botUserId = client.user.id;
  await deleteCertPanelMessages(channel, botUserId);

  const payload = buildCertPanelPayload(cfg);
  const sent = await channel.send(payload);
  await persistPanelMessageId(sent.id, cfg.guildId);

  console.log(
    `[CertPanel] Synced application panel in #${channel.name} (${channel.id}), message ${sent.id}`,
  );

  return { ok: true, channelId, messageId: sent.id };
}

module.exports = {
  BUTTON_STYLE_MAP,
  SEND_OPTIONS,
  buildCertPanelPayload,
  getCertTypeLabel,
  getCertTypeIdFromCustomId,
  isCertPanelMessage,
  syncCertPanel,
  deleteCertPanelMessages,
  persistPanelMessageId,
};
