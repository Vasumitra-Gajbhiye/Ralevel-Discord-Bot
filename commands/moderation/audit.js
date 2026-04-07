const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

const ModLog = require("../../models/modlog");
const generateId = require("../../utils/generateId");

const PAGE_SIZE = 10;
const COLLECTOR_TIMEOUT = 5 * 60 * 1000; // 5 minutes

module.exports = {
  data: new SlashCommandBuilder()
    .setName("audit")
    .setDescription("View server-wide moderation audit logs (paginated).")
    .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages),

  async execute(interaction) {
    const modRoles = (process.env.MOD_ROLES || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    // mod-only check
    if (!interaction.member.roles.cache.some((r) => modRoles.includes(r.id))) {
      return interaction.reply({
        content: "❌ You do not have permission to use this command.",
        ephemeral: true,
      });
    }

    await interaction.deferReply({ ephemeral: false });

    // Count total logs
    const totalLogs = await ModLog.countDocuments().catch(() => 0);
    const totalPages = Math.max(1, Math.ceil(totalLogs / PAGE_SIZE));

    // generate a short uid so buttons are unique
    const uid = generateId().slice(0, 8);

    // helper: fetch logs for page (0-indexed)
    const fetchPage = async (page) => {
      const skip = page * PAGE_SIZE;
      const docs = await ModLog.find({})
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(PAGE_SIZE)
        .lean();
      return docs;
    };

    // helper: build embed for page
    const buildEmbed = (page, docs) => {
      const embed = new EmbedBuilder()
        .setTitle("🧾 Moderation Audit")
        .setColor("#00FFFF")
        .setTimestamp()
        .setFooter({
          text: `Page ${page + 1} / ${totalPages} • ${totalLogs} total logs`,
        });

      if (!docs || docs.length === 0) {
        embed.setDescription("No logs to show on this page.");
        return embed;
      }

      const lines = docs.map((doc) => {
        // attempt to extract relevant short info from reason if structured
        const time = new Date(doc.timestamp || Date.now());
        const timeTs = `<t:${Math.floor(time.getTime() / 1000)}:f>`;
        const action = doc.action || "unknown";
        const modTag = doc.moderatorId
          ? `<@${doc.moderatorId}>`
          : doc.moderatorId || "N/A";
        const target = doc.targetTag || doc.userId || "N/A";
        const channel = doc.targetChannel ? `<#${doc.targetChannel}>` : "N/A";

        // truncate reason for readability
        let reason = (doc.reason || "").replace(/\s+/g, " ").trim();
        if (reason.length > 200) reason = reason.slice(0, 197) + "...";

        return `**${action.toUpperCase()}** • ${timeTs}
• Moderator: ${modTag}
• Target: ${target}
• Channel: ${channel}
• Log ID: \`${doc.actionId}\`
• Reason: ${reason}`;
      });

      embed.setDescription(lines.join("\n\n"));
      return embed;
    };

    // initial page = 0
    let page = 0;
    const docs = await fetchPage(page);
    const embed = buildEmbed(page, docs);

    // buttons
    const prevId = `audit_prev_${uid}`;
    const nextId = `audit_next_${uid}`;

    const prevBtn = new ButtonBuilder()
      .setCustomId(prevId)
      .setLabel("◀ Previous")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(true); // disabled on page 0

    const nextBtn = new ButtonBuilder()
      .setCustomId(nextId)
      .setLabel("Next ▶")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(totalPages <= 1);

    const row = new ActionRowBuilder().addComponents(prevBtn, nextBtn);

    // send initial reply
    const replyMsg = await interaction.editReply({
      content: `Showing moderation logs — page ${page + 1} of ${totalPages}.`,
      embeds: [embed],
      components: [row],
      fetchReply: true,
    });

    // create collector for this message
    const collector = replyMsg.createMessageComponentCollector({
      componentType: "BUTTON",
      time: COLLECTOR_TIMEOUT,
    });

    collector.on("collect", async (btnInt) => {
      // only allow mods from MOD_ROLES to interact
      if (!btnInt.member.roles.cache.some((r) => modRoles.includes(r.id))) {
        return btnInt.reply({
          content: "❌ You cannot interact with this paginator.",
          ephemeral: true,
        });
      }

      // only allow our buttons
      if (![prevId, nextId].includes(btnInt.customId)) {
        return btnInt.deferUpdate();
      }

      // handle previous
      if (btnInt.customId === prevId) {
        if (page > 0) page--;
      } else if (btnInt.customId === nextId) {
        if (page < totalPages - 1) page++;
      }

      // fetch and build new embed
      const newDocs = await fetchPage(page);
      const newEmbed = buildEmbed(page, newDocs);

      // update buttons disabled state
      prevBtn.setDisabled(page === 0);
      nextBtn.setDisabled(page >= totalPages - 1);

      // update components
      const newRow = new ActionRowBuilder().addComponents(prevBtn, nextBtn);

      await btnInt.update({
        content: `Showing moderation logs — page ${page + 1} of ${totalPages}.`,
        embeds: [newEmbed],
        components: [newRow],
      });
    });

    collector.on("end", async () => {
      try {
        // disable buttons when collector ends
        prevBtn.setDisabled(true);
        nextBtn.setDisabled(true);
        const disabledRow = new ActionRowBuilder().addComponents(
          prevBtn,
          nextBtn
        );
        await replyMsg.edit({ components: [disabledRow] }).catch(() => {});
      } catch (err) {
        console.log(err);
      }
    });
  },
};
