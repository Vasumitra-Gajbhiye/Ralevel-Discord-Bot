const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
} = require("discord.js");

const ModLog = require("../../models/modlog.js");
const generateId = require("../../utils/generateId");

const ACTION_EMOJIS = {
  warn: "⚠️",
  delwarn: "🗑️",
  clearwarns: "🧹",
  mute: "🔇",
  unmute: "🔊",
  ban: "🔨",
  unban: "♻️",
  softban: "🛠️",
  kick: "👢",
  slowmode: "🐢",
  slowmode_off: "🚀",
  purge: "🧽",
  lock: "🔒",
  unlock: "🔓",
};

const PAGE_SIZE = 10;
const COLLECTOR_TIMEOUT = 5 * 60 * 1000;

function truncateReason(reason) {
  const normalized = (reason || "").replace(/\s+/g, " ").trim();
  if (normalized.length <= 200) return normalized;
  return normalized.slice(0, 197) + "...";
}

async function fetchModeratorTags(client, moderatorIds) {
  const uniqueIds = [...new Set(moderatorIds.filter(Boolean))];
  const entries = await Promise.all(
    uniqueIds.map(async (id) => {
      try {
        const user = await client.users.fetch(id);
        return [id, user.tag];
      } catch {
        return [id, "Unknown Moderator"];
      }
    }),
  );
  return new Map(entries);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("moderation-logs")
    .setDescription("View moderation logs for a user")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addUserOption((option) =>
      option.setName("user").setDescription("Target user").setRequired(true),
    ),

  async execute(interaction) {
    const user = interaction.options.getUser("user");

    await interaction.deferReply({ ephemeral: false });

    const totalLogs = await ModLog.countDocuments({ userId: user.id }).catch(
      () => 0,
    );

    if (totalLogs === 0) {
      return interaction.editReply({
        content: `📁 No modlogs found for **${user.tag}**.`,
      });
    }

    const totalPages = Math.max(1, Math.ceil(totalLogs / PAGE_SIZE));
    const uid = generateId().slice(0, 8);

    const fetchPage = async (page) => {
      const skip = page * PAGE_SIZE;
      return ModLog.find({ userId: user.id })
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(PAGE_SIZE)
        .lean();
    };

    const buildEmbed = async (page, docs) => {
      const moderatorTags = await fetchModeratorTags(
        interaction.client,
        docs.map((log) => log.moderatorId),
      );

      const embed = new EmbedBuilder()
        .setTitle(`📚 Moderation Logs — ${user.tag}`)
        .setColor("Blue")
        .setFooter({
          text: `Page ${page + 1} / ${totalPages} • ${totalLogs} total logs`,
        });

      if (!docs || docs.length === 0) {
        embed.setDescription("No logs to show on this page.");
        return embed;
      }

      const lines = docs.map((log) => {
        const moderatorTag =
          moderatorTags.get(log.moderatorId) || "Unknown Moderator";
        const emoji = ACTION_EMOJIS[log.action] || "📘";
        const reason = truncateReason(log.reason);

        return (
          `${emoji} **${log.action.toUpperCase()}**\n` +
          `**Moderator:** ${moderatorTag}\n` +
          (log.targetChannel ? `**Channel:** <#${log.targetChannel}>\n` : "") +
          `**ID:** \`${log.actionId}\`\n` +
          `**Reason:** ${reason}\n` +
          `**At:** <t:${Math.floor(new Date(log.timestamp).getTime() / 1000)}:F>`
        );
      });

      embed.setDescription(lines.join("\n\n"));
      return embed;
    };

    let page = 0;
    const docs = await fetchPage(page);
    const embed = await buildEmbed(page, docs);

    const prevId = `modlogs_prev_${uid}`;
    const nextId = `modlogs_next_${uid}`;

    const prevBtn = new ButtonBuilder()
      .setCustomId(prevId)
      .setLabel("◀ Previous")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true);

    const nextBtn = new ButtonBuilder()
      .setCustomId(nextId)
      .setLabel("Next ▶")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(totalPages <= 1);

    const row = new ActionRowBuilder().addComponents(prevBtn, nextBtn);

    const replyMsg = await interaction.editReply({
      content: `Showing moderation logs for **${user.tag}** — page ${page + 1} of ${totalPages}.`,
      embeds: [embed],
      components: [row],
      fetchReply: true,
    });

    const collector = replyMsg.createMessageComponentCollector({
      componentType: 2,
      time: COLLECTOR_TIMEOUT,
    });

    collector.on("collect", async (btnInt) => {
      if (btnInt.user.id !== interaction.user.id) {
        return btnInt.reply({
          content: "❌ You cannot interact with someone else's paginator.",
          ephemeral: true,
        });
      }

      if (![prevId, nextId].includes(btnInt.customId)) {
        return btnInt.deferUpdate();
      }

      if (btnInt.customId === prevId) {
        if (page > 0) page--;
      } else if (btnInt.customId === nextId) {
        if (page < totalPages - 1) page++;
      }

      const newDocs = await fetchPage(page);
      const newEmbed = await buildEmbed(page, newDocs);

      prevBtn.setDisabled(page === 0);
      nextBtn.setDisabled(page >= totalPages - 1);

      const newRow = new ActionRowBuilder().addComponents(prevBtn, nextBtn);

      await btnInt.update({
        content: `Showing moderation logs for **${user.tag}** — page ${page + 1} of ${totalPages}.`,
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
          nextBtn,
        );
        await replyMsg.edit({ components: [disabledRow] }).catch(() => {});
      } catch (err) {
        console.log(err);
      }
    });
  },
};
