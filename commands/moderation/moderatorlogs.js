const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
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

module.exports = {
  data: new SlashCommandBuilder()
    .setName("moderator-logs")
    .setDescription("View all moderation actions taken by a specific moderator")
    .addUserOption((option) =>
      option.setName("user").setDescription("Moderator").setRequired(true),
    ),

  async execute(interaction) {
    const mod = interaction.options.getUser("user");

    await interaction.deferReply({ ephemeral: false });

    const totalLogs = await ModLog.countDocuments({ moderatorId: mod.id }).catch(
      () => 0,
    );

    if (totalLogs === 0) {
      return interaction.editReply({
        content: `📁 No moderation actions found for **${mod.tag}**.`,
      });
    }

    const totalPages = Math.max(1, Math.ceil(totalLogs / PAGE_SIZE));
    const uid = generateId().slice(0, 8);

    const fetchPage = async (page) => {
      const skip = page * PAGE_SIZE;
      return ModLog.find({ moderatorId: mod.id })
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(PAGE_SIZE)
        .lean();
    };

    const buildEmbed = (page, docs) => {
      const embed = new EmbedBuilder()
        .setTitle(`⚖️ Moderator Actions — ${mod.tag}`)
        .setColor("#2f3136")
        .setFooter({
          text: `Page ${page + 1} / ${totalPages} • ${totalLogs} total logs`,
        });

      if (!docs || docs.length === 0) {
        embed.setDescription("No logs to show on this page.");
        return embed;
      }

      const lines = docs.map((log) => {
        const channel = log.targetChannel ? `<#${log.targetChannel}>` : "—";
        const emoji = ACTION_EMOJIS[log.action] || "📘";
        const reason = truncateReason(log.reason);

        return (
          `${emoji} **${log.action.toUpperCase()}**\n` +
          `**Target:** ${log.targetTag}\n` +
          `**Channel:** ${channel}\n` +
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
    const embed = buildEmbed(page, docs);

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
      content: `Showing moderation actions for **${mod.tag}** — page ${page + 1} of ${totalPages}.`,
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
      const newEmbed = buildEmbed(page, newDocs);

      prevBtn.setDisabled(page === 0);
      nextBtn.setDisabled(page >= totalPages - 1);

      const newRow = new ActionRowBuilder().addComponents(prevBtn, nextBtn);

      await btnInt.update({
        content: `Showing moderation actions for **${mod.tag}** — page ${page + 1} of ${totalPages}.`,
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
