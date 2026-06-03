const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

const StickyLog = require("../../models/stickyLog");
const generateId = require("../../utils/generateId");

const PAGE_SIZE = 10;
const COLLECTOR_TIMEOUT = 5 * 60 * 1000;
const EMBED_DESC_LIMIT = 4096;
const CONTENT_PREVIEW_MAX = 400;

function chunkEntries(entries, separator = "\n\n", limit = EMBED_DESC_LIMIT) {
  const chunks = [];
  let current = "";

  const pushCurrent = () => {
    if (current) {
      chunks.push(current);
      current = "";
    }
  };

  const pushLongText = text => {
    let remaining = text;
    while (remaining.length > limit) {
      pushCurrent();
      chunks.push(remaining.slice(0, limit));
      remaining = remaining.slice(limit);
    }
    current = remaining;
  };

  for (const entry of entries) {
    if (entry.length > limit) {
      pushCurrent();
      pushLongText(entry);
      continue;
    }

    const next = current ? `${current}${separator}${entry}` : entry;
    if (next.length > limit) {
      pushCurrent();
      current = entry;
    } else {
      current = next;
    }
  }

  pushCurrent();
  return chunks;
}

function formatLogLine(log) {
  const time = `<t:${Math.floor(log.createdAt.getTime() / 1000)}:R>`;
  const parts = [
    `**${log.action}** in <#${log.channelId}>`,
    `• Mod: ${log.moderatorTag}`,
  ];

  if (log.content) {
    let content = log.content;
    if (content.length > CONTENT_PREVIEW_MAX) {
      content = `${content.slice(0, CONTENT_PREVIEW_MAX - 3)}...`;
    }
    parts.push(`• Content: ${content}`);
  }

  if (log.lineThreshold != null) {
    parts.push(`• Threshold: ${log.lineThreshold} lines`);
  }

  parts.push(`• ${time}`);

  return parts.join("\n");
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("sticky-log")
    .setDescription("View recent sticky moderation actions")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageMessages
    ),

  async execute(interaction) {
    const guildId = interaction.guildId;

    const totalLogs = await StickyLog.countDocuments({ guildId });
    if (!totalLogs) {
      return interaction.reply({
        content: "ℹ️ No sticky actions logged yet.",
        ephemeral: true,
      });
    }

    const totalPages = Math.max(1, Math.ceil(totalLogs / PAGE_SIZE));
    const uid = generateId().slice(0, 8);

    const fetchPage = async page => {
      return StickyLog.find({ guildId })
        .sort({ createdAt: -1 })
        .skip(page * PAGE_SIZE)
        .limit(PAGE_SIZE)
        .lean();
    };

    const buildEmbed = (page, docs) => {
      const embed = new EmbedBuilder()
        .setTitle("📌 Sticky Log")
        .setColor(0x00ffff)
        .setFooter({
          text: `Page ${page + 1} / ${totalPages} • ${totalLogs} total • newest first`,
        });

      if (!docs.length) {
        embed.setDescription("No logs on this page.");
        return embed;
      }

      const lines = docs.map(formatLogLine);
      const chunks = chunkEntries(lines);
      let description = chunks[0];

      if (chunks.length > 1) {
        description += `\n\n*(${chunks.length - 1} more section(s) omitted on this page — content truncated)*`;
        if (description.length > EMBED_DESC_LIMIT) {
          description = description.slice(0, EMBED_DESC_LIMIT - 3) + "...";
        }
      }

      embed.setDescription(description);
      return embed;
    };

    let page = 0;
    const docs = await fetchPage(page);
    const embed = buildEmbed(page, docs);

    const prevId = `stickylog_prev_${uid}`;
    const nextId = `stickylog_next_${uid}`;

    const prevBtn = new ButtonBuilder()
      .setCustomId(prevId)
      .setLabel("◀ Previous")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(true);

    const nextBtn = new ButtonBuilder()
      .setCustomId(nextId)
      .setLabel("Next ▶")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(totalPages <= 1);

    const row = new ActionRowBuilder().addComponents(prevBtn, nextBtn);

    const replyMsg = await interaction.reply({
      content: `Sticky moderation log — page ${page + 1} of ${totalPages}.`,
      embeds: [embed],
      components: [row],
      ephemeral: true,
      fetchReply: true,
    });

    const collector = replyMsg.createMessageComponentCollector({
      componentType: 2,
      time: COLLECTOR_TIMEOUT,
    });

    collector.on("collect", async btnInt => {
      if (btnInt.user.id !== interaction.user.id) {
        return btnInt.reply({
          content: "❌ You cannot interact with someone else's paginator.",
          ephemeral: true,
        });
      }

      if (![prevId, nextId].includes(btnInt.customId)) {
        return btnInt.deferUpdate();
      }

      if (btnInt.customId === prevId && page > 0) page--;
      else if (btnInt.customId === nextId && page < totalPages - 1) page++;

      const newDocs = await fetchPage(page);
      const newEmbed = buildEmbed(page, newDocs);

      prevBtn.setDisabled(page === 0);
      nextBtn.setDisabled(page >= totalPages - 1);

      const newRow = new ActionRowBuilder().addComponents(prevBtn, nextBtn);

      await btnInt.update({
        content: `Sticky moderation log — page ${page + 1} of ${totalPages}.`,
        embeds: [newEmbed],
        components: [newRow],
      });
    });

    collector.on("end", async () => {
      try {
        prevBtn.setDisabled(true);
        nextBtn.setDisabled(true);
        const disabledRow = new ActionRowBuilder().addComponents(
          prevBtn,
          nextBtn
        );
        await replyMsg.edit({ components: [disabledRow] }).catch(() => {});
      } catch {
        // message may already be gone
      }
    });
  },
};
