// const {
//     SlashCommandBuilder,
//     PermissionFlagsBits,
//     EmbedBuilder
// } = require("discord.js");

// module.exports = {
//     data: new SlashCommandBuilder()
//         .setName("lock-status")
//         .setDescription("Check which channels are currently locked.")
//         .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

//     async execute(interaction) {
//         const guild = interaction.guild;

//         // ---- PERMANENT LOCKED CHANNEL IDs ----
//         const permanentLocked = new Set([
//             "1122879003024433242",
//             "1122878155380768878",
//             "1122877792070144050",
//             "1352986228064256010",
//             "1232632535155085414",
//             "1114440989080297502",
//             "1122876796766007446",
//             "1232665332318081075",
//             "1233146542374912111",
//             "1325384293970870292",
//             "1232682048544571483",
//             "1351147208753545320",
//             "1127986149634359316",
//             "1117340250176503858",
//             "1408407184915562556",
//             "1116969076938514525",
//             "1114440288275026012",
//             "1117109381851512862",
//             "1327278764346052668",
//             "1122877056334708776",
//             "1429853336722473032",
//             "1128326309001572362",
//             "1127254095644864512",
//             "1122877636646027264",
//             "1352985842322247680",
//             "1122877184667811850",
//             "1130053463389257788",
//             "1114440128929210418",
//             "1122878396234481734",
//             "1232692954053742684"
//         ]);

//         // ---- TEMPORARY LOCKED CHANNELS ----
//         const lockableChannels = guild.channels.cache.filter(ch =>
//             ch.isTextBased() && ch.permissionOverwrites
//         );

//         const temporarilyLocked = lockableChannels.filter(channel => {
//             // Ignore permanent locked channels
//             if (permanentLocked.has(channel.id)) return false;

//             const overwrite = channel.permissionOverwrites.resolve(
//                 guild.roles.everyone.id
//             );
//             if (!overwrite) return false;

//             return overwrite.deny?.has("SendMessages");
//         });

//         // ---- BUILD EMBED ----
//         const embed = new EmbedBuilder()
//             .setColor(0x2b2d31)
//             .setTitle("🔒 Locked Channels Status")
//             .setTimestamp();

//         // Temporary locks section
//         if (temporarilyLocked.size === 0) {
//             embed.addFields({
//                 name: "🟡 Temporary Locks",
//                 value: "No active temporary locks.",
//                 inline: false
//             });
//         } else {
//             embed.addFields({
//                 name: "🟡 Temporary Locks",
//                 value: temporarilyLocked.map(ch => `🔒 <#${ch.id}>`).join("\n"),
//                 inline: false
//             });
//         }

//         // Permanent locks section
//         const permanentList = [...permanentLocked]
//             .map(id => {
//                 const ch = guild.channels.cache.get(id);
//                 return ch ? `📌 <#${id}>` : `📌 [Deleted Channel: ${id}]`;
//             })
//             .join("\n");

//         embed.addFields({
//             name: "🔐 Permanent Locked Channels",
//             value: permanentList || "None",
//             inline: false
//         });

//         return interaction.reply({ embeds: [embed] });
//     }
// };

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("lock-status")
    .setDescription("Check locked channels")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addStringOption((option) =>
      option
        .setName("type")
        .setDescription("Which locks to view")
        .setRequired(true)
        .addChoices(
          { name: "Temporary Locks", value: "temporary" },
          { name: "Permanent Locks", value: "permanent" }
        )
    ),
  async execute(interaction) {
    const type = interaction.options.getString("type");
    const guild = interaction.guild;

    // ---- PERMANENT LOCKED CHANNEL IDs FOR MAIN SERVER (NOT TESTING) ----
    const permanentLocked = new Set([
      "1122879003024433242",
      "1122878155380768878",
      "1122877792070144050",
      "1352986228064256010",
      "1232632535155085414",
      "1114440989080297502",
      "1122876796766007446",
      "1232665332318081075",
      "1233146542374912111",
      "1325384293970870292",
      "1232682048544571483",
      "1351147208753545320",
      "1127986149634359316",
      "1117340250176503858",
      "1408407184915562556",
      "1116969076938514525",
      "1114440288275026012",
      "1117109381851512862",
      "1327278764346052668",
      "1122877056334708776",
      "1429853336722473032",
      "1128326309001572362",
      "1127254095644864512",
      "1122877636646027264",
      "1352985842322247680",
      "1122877184667811850",
      "1130053463389257788",
      "1114440128929210418",
      "1122878396234481734",
      "1232692954053742684",
    ]);

    // ---- TEMPORARY LOCKED CHANNELS ----
    const lockableChannels = guild.channels.cache.filter(
      (ch) => ch.isTextBased() && ch.permissionOverwrites
    );

    const temporarilyLocked = lockableChannels.filter((channel) => {
      if (permanentLocked.has(channel.id)) return false;

      const overwrite = channel.permissionOverwrites.resolve(
        guild.roles.everyone.id
      );
      if (!overwrite) return false;

      return overwrite.deny?.has("SendMessages");
    });

    const embed = new EmbedBuilder()
      .setColor(0x2b2d31)
      .setTitle("🔒 Locked Channels Status")
      .setTimestamp();

    if (type === "temporary") {
      let tempList = temporarilyLocked.map((ch) => `🔒 <#${ch.id}>`).join("\n");

      if (!tempList) tempList = "No active temporary locks.";

      tempList = tempList.slice(0, 1020);

      embed.addFields({
        name: "🟡 Temporary Locks",
        value: tempList,
        inline: false,
      });
    } else if (type === "permanent") {
      let permanentList = [...permanentLocked]
        .map((id) => {
          const ch = guild.channels.cache.get(id);
          return ch ? `📌 <#${id}>` : `📌 [Deleted Channel: ${id}]`;
        })
        .join("\n");

      if (!permanentList) permanentList = "None";

      permanentList = permanentList.slice(0, 1020);

      embed.addFields({
        name: "🔐 Permanent Locked Channels",
        value: permanentList,
        inline: false,
      });
    }

    return interaction.reply({ embeds: [embed] });
  },
};
