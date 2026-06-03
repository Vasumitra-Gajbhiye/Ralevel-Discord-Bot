const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
} = require("discord.js");

const ModLog = require("../../models/modlog.js");

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

// Hidden delimiter (OPTION C)
const DELIM = "​"; // zero-width space

module.exports = {
  data: new SlashCommandBuilder()
    .setName("moderation-logs")
    .setDescription("View moderation logs for a user")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption((option) =>
      option.setName("user").setDescription("Target user").setRequired(true),
    ),

  async execute(interaction) {
    const user = interaction.options.getUser("user");

    // Fetch newest → oldest
    const logs = await ModLog.find({ userId: user.id }).sort({ timestamp: -1 });

    if (logs.length === 0) {
      return interaction.reply({
        content: `📁 No modlogs found for **${user.tag}**.`,
        flags: 64,
      });
    }

    const formatted = [];

    for (const log of logs) {
      let moderatorTag = "Unknown Moderator";

      try {
        const modUser = await interaction.client.users.fetch(log.moderatorId);
        moderatorTag = modUser.tag;
      } catch {}

      const emoji = ACTION_EMOJIS[log.action] || "📘";

      // PREFIX EACH LOG WITH HIDDEN DELIMITER
      formatted.push(
        `${DELIM}${emoji} **${log.action.toUpperCase()}**\n` +
          `**Moderator:** ${moderatorTag}\n` +
          (log.targetChannel ? `**Channel:** <#${log.targetChannel}>\n` : "") +
          `**ID:** \`${log.actionId}\`\n` +
          `**Reason:** ${log.reason}\n` +
          `**At:** <t:${Math.floor(log.timestamp / 1000)}:F>\n`,
      );
    }

    // PAGINATION
    const pages = [];
    let buffer = "";

    for (const entry of formatted) {
      if (buffer.length + entry.length > 3900) {
        pages.push(buffer);
        buffer = "";
      }
      buffer += entry + "\n";
    }
    if (buffer.length > 0) pages.push(buffer);

    let page = 0;

    const buildEmbed = () => {
      const logsOnPage = pages[page].split(DELIM).length - 1;

      let startIndex = 0;
      for (let i = 0; i < page; i++) {
        startIndex += pages[i].split(DELIM).length - 1;
      }

      return new EmbedBuilder()
        .setTitle(`📚 Moderation Logs — ${user.tag}`)
        .setDescription(pages[page])
        .setColor("Blue")
        .setFooter({
          text: `Page ${page + 1}/${pages.length} • Showing ${startIndex + 1}–${startIndex + logsOnPage} of ${logs.length} logs`,
        });
    };

    const getButtons = () =>
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("prev_page")
          .setLabel("◀️ Previous")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page === 0),

        new ButtonBuilder()
          .setCustomId("next_page")
          .setLabel("Next ▶️")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page === pages.length - 1),
      );

    const msg = await interaction.reply({
      embeds: [buildEmbed()],
      components: [getButtons()],
      fetchReply: true,
    });

    const collector = msg.createMessageComponentCollector({
      time: 180000,
    });

    collector.on("collect", async (btn) => {
      if (btn.user.id !== interaction.user.id)
        return btn.reply({ content: "❌ Not your menu.", flags: 64 });

      if (btn.customId === "next_page") page++;
      else if (btn.customId === "prev_page") page--;

      await btn.update({
        embeds: [buildEmbed()],
        components: [getButtons()],
      });
    });

    collector.on("end", () => msg.edit({ components: [] }).catch(() => {}));
  },
};
