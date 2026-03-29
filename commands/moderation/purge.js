const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");

const ModLog = require("../../models/modlog.js");
const generateId = require("../../utils/generateId.js");
const logModAction = require("../../utils/logModAction");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("purge")
    .setDescription("Delete messages with multiple advanced filters.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)

    // REQUIRED FIRST
    .addChannelOption((opt) =>
      opt
        .setName("channel")
        .setDescription("Channel to purge messages in.")
        .setRequired(true)
    )

    .addIntegerOption((opt) =>
      opt
        .setName("amount")
        .setDescription("Number of recent messages to check (max 100).")
        .setRequired(true)
    )

    .addStringOption((opt) =>
      opt
        .setName("filter")
        .setDescription("Filter to apply.")
        .setRequired(true)
        .addChoices(
          { name: "Everyone (no filter)", value: "everyone" },
          { name: "Specific user", value: "user" },
          { name: "Attachments only", value: "attachments" },
          { name: "Embeds only", value: "embeds" },
          { name: "Bots only", value: "bots" },
          { name: "Non-bots only", value: "nobots" },
          { name: "Messages with links", value: "links" },
          { name: "Messages with images", value: "images" },
          { name: "Keyword match", value: "keyword" },
          { name: "Last X hours", value: "hours" }
        )
    )

    .addStringOption((opt) =>
      opt
        .setName("reason")
        .setDescription("Reason for purge.")
        .setRequired(true)
    )

    // OPTIONAL AFTER
    .addUserOption((opt) =>
      opt
        .setName("target")
        .setDescription("User to filter for (used with 'specific user').")
    )

    .addStringOption((opt) =>
      opt.setName("keyword").setDescription("Keyword to filter with.")
    )

    .addIntegerOption((opt) =>
      opt.setName("hours").setDescription("Delete messages from last X hours.")
    ),

  async execute(interaction) {
    const { EmbedBuilder } = require("discord.js");

    const channel = interaction.options.getChannel("channel");
    const amount = interaction.options.getInteger("amount");
    const filter = interaction.options.getString("filter");
    const targetUser = interaction.options.getUser("target");
    const keyword = interaction.options.getString("keyword");
    const hours = interaction.options.getInteger("hours");
    const reason = interaction.options.getString("reason");

    if (amount > 100)
      return interaction.reply({
        content: "❌ Maximum amount is **100**.",
        ephemeral: true,
      });

    let messages = await channel.messages.fetch({ limit: amount });

    // ----------------------------
    // FILTERS
    // ----------------------------
    if (filter === "user") {
      if (!targetUser)
        return interaction.reply({
          content: "❌ You must specify a user.",
          ephemeral: true,
        });

      messages = messages.filter((m) => m.author.id === targetUser.id);
    } else if (filter === "attachments")
      messages = messages.filter((m) => m.attachments.size > 0);
    else if (filter === "embeds")
      messages = messages.filter((m) => m.embeds.length > 0);
    else if (filter === "bots") messages = messages.filter((m) => m.author.bot);
    else if (filter === "nobots")
      messages = messages.filter((m) => !m.author.bot);
    else if (filter === "links")
      messages = messages.filter((m) =>
        /(http:\/\/|https:\/\/)/gi.test(m.content)
      );
    else if (filter === "images")
      messages = messages.filter((m) =>
        m.attachments.some(
          (a) =>
            a.contentType?.startsWith("image") ||
            a.url.match(/\.(png|jpg|jpeg|gif|webp)$/i)
        )
      );
    else if (filter === "keyword") {
      if (!keyword)
        return interaction.reply({
          content: "❌ Keyword required.",
          ephemeral: true,
        });

      messages = messages.filter((m) =>
        m.content.toLowerCase().includes(keyword.toLowerCase())
      );
    } else if (filter === "hours") {
      if (!hours)
        return interaction.reply({
          content: "❌ Hours required.",
          ephemeral: true,
        });

      const cutoff = Date.now() - hours * 3600000;
      messages = messages.filter((m) => m.createdTimestamp >= cutoff);
    }

    // Final list
    const toDelete = [...messages.values()].slice(0, 100);

    await channel.bulkDelete(toDelete, true).catch(() => {});

    // ----------------------------
    // CREATE MODLOG ENTRY
    // ----------------------------

    const actionId = generateId();

    const detailedReason = `
Filter Used: ${filter}
Channel: #${channel.name}
Messages Deleted: ${toDelete.length}
Target User: ${targetUser ? targetUser.tag : "Everyone"}
Keyword: ${keyword || "N/A"}
Hours Filter: ${hours || "N/A"}
Moderator Reason: ${reason}
`.trim();

    // await ModLog.create({
    //     userId: targetUser ? targetUser.id : "N/A",
    //     targetChannel: channel.id,
    //     moderatorId: interaction.user.id,
    //     action: "purge",
    //     reason: detailedReason,
    //     actionId,
    //     targetTag: targetUser ? targetUser.tag : "Everyone"
    // });

    await logModAction({
      interaction,
      userId: targetUser?.id || "N/A",
      userTag: targetUser?.tag || "N/A",
      moderatorTag: interaction.user.tag,
      moderatorId: interaction.user.id,
      action: "purge",
      // target: targetUser,
      reason: reason,
      actionId,
      channelTag: channel.name,
      channelId: channel.id,
      numberOfPurgeMessages: amount,
      purgeFilter: filter,
      purgeKeyword: keyword,
      purgeHours: hours,
      // targetTag: targetUser,
    });

    // ----------------------------
    // EMBED CONFIRMATION
    // ----------------------------

    const embed = new EmbedBuilder()
      .setColor(0x2b2d31)
      .setTitle("🧹 Purge Successful")
      .addFields(
        { name: "Channel", value: `<#${channel.id}>`, inline: true },
        { name: "Filter", value: filter, inline: true },
        { name: "Deleted Messages", value: `${toDelete.length}`, inline: true },

        {
          name: "Target User",
          value: targetUser ? targetUser.tag : "Everyone",
          inline: true,
        },
        { name: "Keyword", value: keyword || "N/A", inline: true },
        {
          name: "Last X Hours",
          value: hours ? `${hours}` : "N/A",
          inline: true,
        },

        { name: "Moderator", value: interaction.user.tag, inline: true },
        { name: "Log ID", value: `\`${actionId}\``, inline: true }
      )
      .setTimestamp();

    return interaction.reply({
      embeds: [embed],
    });
  },
};
