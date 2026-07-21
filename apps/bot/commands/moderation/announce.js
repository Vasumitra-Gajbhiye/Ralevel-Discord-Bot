// const {
//   SlashCommandBuilder,
//   PermissionFlagsBits,
//   EmbedBuilder,
//   ActionRowBuilder,
//   ButtonBuilder,
//   ButtonStyle,
// } = require("discord.js");

// const generateId = require("../../utils/generateId.js");
// const logModAction = require("../../utils/logModAction");

// module.exports = {
//   data: new SlashCommandBuilder()
//     .setName("announce")
//     .setDescription("Send a professional announcement embed to any channel.")
//     .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages)

//     // REQUIRED FIRST
//     .addChannelOption((opt) =>
//       opt
//         .setName("channel")
//         .setDescription("Channel where the announcement will be posted.")
//         .setRequired(true)
//     )

//     .addStringOption((opt) =>
//       opt
//         .setName("title")
//         .setDescription("Title of the announcement.")
//         .setRequired(true)
//     )

//     .addStringOption((opt) =>
//       opt
//         .setName("description")
//         .setDescription("Main announcement message.")
//         .setRequired(true)
//     )

//     .addStringOption((opt) =>
//       opt
//         .setName("reason")
//         .setDescription("Reason for announcing this.")
//         .setRequired(true)
//     )

//     // OPTIONAL AFTER
//     .addRoleOption((opt) =>
//       opt.setName("ping").setDescription("Ping a specific role.")
//     )

//     .addBooleanOption((opt) =>
//       opt.setName("ping-everyone").setDescription("Ping @everyone?")
//     )

//     .addBooleanOption((opt) =>
//       opt.setName("ping-here").setDescription("Ping @here?")
//     )

//     .addStringOption((opt) =>
//       opt
//         .setName("color")
//         .setDescription("Hex color (default cyan). Example: #00ffff")
//     )

//     .addAttachmentOption((opt) =>
//       opt.setName("image").setDescription("Optional image for the embed.")
//     )

//     .addAttachmentOption((opt) =>
//       opt.setName("thumbnail").setDescription("Thumbnail for the embed.")
//     )

//     .addStringOption((opt) =>
//       opt.setName("button-label").setDescription("Button text (optional).")
//     )

//     .addStringOption((opt) =>
//       opt.setName("button-url").setDescription("URL the button will link to.")
//     ),

//   async execute(interaction) {
//     await interaction.deferReply({ flags: 64 });

//     const modRoles = process.env.MOD_ROLES.split(",");
//     const moderator = interaction.member;

//     // Mod-only check
//     if (!moderator.roles.cache.some((r) => modRoles.includes(r.id))) {
//       return interaction.editReply({
//         content: "❌ You do not have permission to use /announce.",
//       });
//     }

//     const channel = interaction.options.getChannel("channel");
//     const title = interaction.options.getString("title");
//     const description = interaction.options.getString("description");
//     const reason = interaction.options.getString("reason");
//     const color = interaction.options.getString("color") || "#00ffff"; // cyan default

//     const pingRole = interaction.options.getRole("ping");
//     const pingEveryone = interaction.options.getBoolean("ping-everyone");
//     const pingHere = interaction.options.getBoolean("ping-here");

//     const imageAttachment = interaction.options.getAttachment("image");
//     const thumbnailAttachment = interaction.options.getAttachment("thumbnail");

//     const buttonLabel = interaction.options.getString("button-label");
//     const buttonUrl = interaction.options.getString("button-url");

//     let pingParts = [];
//     if (pingRole) pingParts.push(`<@&${pingRole.id}>`);
//     if (pingEveryone) pingParts.push("@everyone");
//     if (pingHere) pingParts.push("@here");

//     const pingText = pingParts.join(" ");

//     // ------------------------------
//     // BUILD ANNOUNCEMENT EMBED
//     // ------------------------------

//     let formattedDescription = description
//       .replace(/\\n/g, "\n") // Converts literal "\n"
//       .trim();

//     const embed = new EmbedBuilder()
//       .setColor(color)
//       .setTitle(`📢 ${title}`)
//       .setDescription(formattedDescription)
//       .setFooter({ text: "Official r/alevel Announcement" })
//       .setTimestamp();

//     if (imageAttachment) embed.setImage(imageAttachment.url);
//     if (thumbnailAttachment) embed.setThumbnail(thumbnailAttachment.url);

//     // Optional button
//     let components = [];
//     if (buttonLabel && buttonUrl) {
//       components.push(
//         new ActionRowBuilder().addComponents(
//           new ButtonBuilder()
//             .setLabel(buttonLabel)
//             .setStyle(ButtonStyle.Link)
//             .setURL(buttonUrl)
//         )
//       );
//     }

//     // ------------------------------
//     // SEND ANNOUNCEMENT
//     //-------------------------------
//     await channel.send({
//       content: pingText || null,
//       embeds: [embed],
//       components,
//     });

//     // ------------------------------
//     // Log action (DB + channel)
//     // ------------------------------
//     const actionId = generateId();

//     await logModAction({
//       interaction,
//       // userId: user.id,
//       // userTag: user.tag,
//       moderatorTag: interaction.user.tag,
//       moderatorId: interaction.user.id,
//       action: "announce",
//       reason,
//       actionId,
//       channelTag: channel.name,
//       channelId: channel.id,
//       title,
//       description: formattedDescription,
//       color,
//       image: imageAttachment?.url || null,
//       thumbnail: thumbnailAttachment?.url || null,
//       button: {
//         label: buttonLabel || null,
//         url: buttonUrl || null,
//       },
//       ping: {
//         roleId: pingRole?.id || null,
//         everyone: !!pingEveryone,
//         here: !!pingHere,
//       },
//     });

//     // ------------------------------
//     // CONFIRMATION EMBED
//     // ------------------------------
//     const confirm = new EmbedBuilder()
//       .setColor("#00ffff")
//       .setTitle("📢 Announcement Sent")
//       .addFields(
//         { name: "Channel", value: `<#${channel.id}>`, inline: true },
//         { name: "Ping", value: pingText || "None", inline: true },
//         { name: "Moderator", value: interaction.user.tag, inline: true },
//         { name: "Reason", value: reason },
//         { name: "Log ID", value: `\`${actionId}\`` }
//       )
//       .setTimestamp();

//     return interaction.editReply({ embeds: [confirm] });
//   },
// };

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

const generateId = require("../../utils/generateId.js");
const logModAction = require("../../utils/logModAction");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("announce")
    .setDescription("Send a professional announcement embed to any channel.")
    .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages)
    .addChannelOption((opt) =>
      opt
        .setName("channel")
        .setDescription("Channel where the announcement will be posted.")
        .setRequired(true),
    )
    .addStringOption((opt) =>
      opt
        .setName("title")
        .setDescription("Title of the announcement.")
        .setRequired(true),
    )
    .addStringOption((opt) =>
      opt
        .setName("description")
        .setDescription("Main announcement message.")
        .setRequired(true),
    )
    .addStringOption((opt) =>
      opt
        .setName("reason")
        .setDescription("Reason for announcing this.")
        .setRequired(true),
    )
    .addRoleOption((opt) =>
      opt.setName("ping").setDescription("Ping a specific role."),
    )
    .addBooleanOption((opt) =>
      opt.setName("ping-everyone").setDescription("Ping @everyone?"),
    )
    .addBooleanOption((opt) =>
      opt.setName("ping-here").setDescription("Ping @here?"),
    )
    .addStringOption((opt) =>
      opt
        .setName("color")
        .setDescription("Hex color (default cyan). Example: #00ffff"),
    )
    .addAttachmentOption((opt) =>
      opt.setName("image").setDescription("Optional image for the embed."),
    )
    .addAttachmentOption((opt) =>
      opt.setName("thumbnail").setDescription("Thumbnail for the embed."),
    )
    .addStringOption((opt) =>
      opt.setName("button-label").setDescription("Button text (optional)."),
    )
    .addStringOption((opt) =>
      opt.setName("button-url").setDescription("URL the button will link to."),
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const channel = interaction.options.getChannel("channel");
    const title = interaction.options.getString("title");
    const description = interaction.options.getString("description");
    const reason = interaction.options.getString("reason");
    const color = interaction.options.getString("color") || "#00ffff";

    if (title.length > 256) {
      return interaction.editReply(
        "❌ The title is too long! (Max 256 characters)",
      );
    }

    const pingRole = interaction.options.getRole("ping");
    const pingEveryone = interaction.options.getBoolean("ping-everyone");
    const pingHere = interaction.options.getBoolean("ping-here");
    const imageAttachment = interaction.options.getAttachment("image");
    const thumbnailAttachment = interaction.options.getAttachment("thumbnail");
    const buttonLabel = interaction.options.getString("button-label");
    const buttonUrl = interaction.options.getString("button-url");

    let pingParts = [];
    if (pingRole) pingParts.push(`<@&${pingRole.id}>`);
    if (pingEveryone) pingParts.push("@everyone");
    if (pingHere) pingParts.push("@here");
    const pingText = pingParts.join(" ");

    // --- 1. CHUNK THE DESCRIPTION ---
    let formattedDescription = description.replace(/\\n/g, "\n").trim();

    // Split text cleanly into chunks of max 4000 characters without breaking words if possible
    const chunks = [];
    let currentChunk = "";
    const words = formattedDescription.split(" ");

    for (const word of words) {
      if (currentChunk.length + word.length + 1 > 4000) {
        chunks.push(currentChunk);
        currentChunk = word; // Start new chunk
      } else {
        currentChunk += (currentChunk.length > 0 ? " " : "") + word;
      }
    }
    if (currentChunk) chunks.push(currentChunk);

    // --- 2. SEND THE CHUNKS ---
    try {
      for (let i = 0; i < chunks.length; i++) {
        const isFirst = i === 0;
        const isLast = i === chunks.length - 1;

        const embed = new EmbedBuilder()
          .setColor(color)
          .setDescription(chunks[i]);

        // Only add Title, Thumbnails, and Timestamps to the FIRST embed
        if (isFirst) {
          embed.setTitle(`${title}`);
          if (thumbnailAttachment) embed.setThumbnail(thumbnailAttachment.url);
          // If there's only one chunk, we can add the image and footer here too
          if (isLast) {
            embed
              .setFooter({ text: "Official r/alevel Announcement" })
              .setTimestamp();
            if (imageAttachment) embed.setImage(imageAttachment.url);
          }
        }

        // Add Image and Footer to the LAST embed (if multiple chunks)
        if (!isFirst && isLast) {
          embed
            .setFooter({ text: "Official r/alevel Announcement" })
            .setTimestamp();
          if (imageAttachment) embed.setImage(imageAttachment.url);
        }

        // Attach buttons only to the LAST chunk
        let components = [];
        if (isLast && buttonLabel && buttonUrl) {
          components.push(
            new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setLabel(buttonLabel)
                .setStyle(ButtonStyle.Link)
                .setURL(buttonUrl),
            ),
          );
        }

        // Send the message
        await channel.send({
          content: isFirst && pingText ? pingText : null, // Only ping on the first message
          embeds: [embed],
          components: components.length > 0 ? components : [],
        });
      }
    } catch (error) {
      console.error("Failed to send announcement:", error);
      return interaction.editReply(
        "❌ Failed to send the announcement. Check my channel permissions or embed limits.",
      );
    }

    // --- 3. LOGGING & CONFIRMATION ---
    const actionId = generateId();
    try {
      await logModAction({
        interaction,
        moderatorTag: interaction.user.tag,
        moderatorId: interaction.user.id,
        action: "announce",
        reason,
        actionId,
        channelTag: channel.name,
        channelId: channel.id,
        title,
        description:
          "Message was chunked. Preview: " +
          chunks[0].substring(0, 500) +
          "...", // Don't overflow the DB
        color,
      });
    } catch (error) {
      console.error("Failed to log mod action:", error);
    }

    const safeReason =
      reason.length > 1024 ? reason.substring(0, 1021) + "..." : reason;
    const confirm = new EmbedBuilder()
      .setColor("#00ffff")
      .setTitle("Announcement Sent")
      .addFields(
        { name: "Channel", value: `<#${channel.id}>`, inline: true },
        { name: "Ping", value: pingText || "None", inline: true },
        { name: "Moderator", value: interaction.user.tag, inline: true },
        {
          name: "Parts Sent",
          value: `${chunks.length} message(s)`,
          inline: true,
        },
        { name: "Reason", value: safeReason },
        { name: "Log ID", value: `\`${actionId}\`` },
      )
      .setTimestamp();

    return interaction.editReply({ embeds: [confirm] });
  },
};
