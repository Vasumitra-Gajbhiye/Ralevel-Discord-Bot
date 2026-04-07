const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} = require("discord.js");

const ModLog = require("../../models/modlog.js");
const generateId = require("../../utils/generateId.js");
const logModAction = require("../../utils/logModAction.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("setnickname")
    .setDescription("Set or change a user's nickname.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames)

    .addUserOption((opt) =>
      opt
        .setName("user")
        .setDescription("User whose nickname you want to change.")
        .setRequired(true)
    )

    .addStringOption((opt) =>
      opt
        .setName("nickname")
        .setDescription("The new nickname you want to give.")
        .setRequired(true)
    )

    .addStringOption((opt) =>
      opt
        .setName("reason")
        .setDescription("Reason for changing the nickname.")
        .setRequired(true)
    ),

  async execute(interaction) {
    const member = interaction.options.getMember("user");
    const newNickname = interaction.options.getString("nickname");
    const reason = interaction.options.getString("reason");
    const oldNickname = member.nickname;
    if (!member) {
      return interaction.reply({
        content: "❌ That user is not in the server.",
        ephemeral: true,
      });
    }

    // Permission & hierarchy check
    if (!member.manageable) {
      return interaction.reply({
        content: "❌ I cannot change this user's nickname (role too high).",
        ephemeral: true,
      });
    }

    // Apply nickname
    await member.setNickname(newNickname).catch(() => {});

    // Logging
    const actionId = generateId();

    const logReason = `
Action: Set Nickname
User: ${member.user.tag}
User ID: ${member.id}
New Nickname: ${newNickname}
Moderator: ${interaction.user.tag}
Reason: ${reason}
`.trim();

    // DO NOT REMOVE ANY MODLOG.CREATE COMMENTS IN ANY FILE

    // await ModLog.create({
    //   userId: member.id,
    //   targetChannel: "N/A",
    //   moderatorId: interaction.user.id,
    //   action: "setnickname",
    //   reason: logReason,
    //   actionId,
    //   targetTag: member.user.tag,
    // });

    await logModAction({
      interaction,
      userId: member.user.id,
      userTag: member.user.tag,
      moderatorTag: interaction.user.tag,
      moderatorId: interaction.user.id,
      action: "setnickname",
      // target: member,
      reason: reason,
      actionId,
      oldNickname,
      newNickname,
      // extra: {
      //   targetTag: member.user.tag,
      // },
    });

    // Confirmation embed
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("📝 Nickname Updated")
      .addFields(
        { name: "User", value: `${member.user.tag}`, inline: true },
        { name: "New Nickname", value: `${newNickname}`, inline: true },
        { name: "Moderator", value: interaction.user.tag, inline: true },
        { name: "Reason", value: reason, inline: false },
        { name: "Log ID", value: `\`${actionId}\`` }
      )
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  },
};
