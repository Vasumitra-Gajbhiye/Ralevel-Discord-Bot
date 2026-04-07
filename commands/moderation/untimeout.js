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
    .setName("untimeout")
    .setDescription("Remove timeout from a user.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)

    .addUserOption((opt) =>
      opt
        .setName("user")
        .setDescription("User to remove timeout from.")
        .setRequired(true)
    )

    .addStringOption((opt) =>
      opt
        .setName("reason")
        .setDescription("Reason for removing timeout.")
        .setRequired(true)
    ),

  async execute(interaction) {
    const member = interaction.options.getMember("user");
    const reason = interaction.options.getString("reason");

    if (!member) {
      return interaction.reply({
        content: "❌ That user is not in the server.",
        ephemeral: true,
      });
    }

    if (!member.isCommunicationDisabled()) {
      return interaction.reply({
        content: "❌ This user is not currently timed out.",
        ephemeral: true,
      });
    }

    if (!member.moderatable) {
      return interaction.reply({
        content: "❌ I cannot untimeout this user (role too high).",
        ephemeral: true,
      });
    }

    // Remove timeout
    await member.timeout(null).catch(() => {});

    const actionId = generateId();

    // Log entry
    const logReason = `
Action: Remove Timeout
User: ${member.user.tag}
User ID: ${member.id}
Moderator: ${interaction.user.tag}
Reason: ${reason}
`.trim();

    // DO NOT REMOVE ANY MODLOG.CREATE COMMENTS IN ANY FILE

    // await ModLog.create({
    //     userId: member.id,
    //     targetChannel: "N/A",
    //     moderatorId: interaction.user.id,
    //     action: "untimeout",
    //     reason: logReason,
    //     actionId,
    //     targetTag: member.user.tag
    // });

    await logModAction({
      interaction,
      userId: member.user.id,
      userTag: member.user.tag,
      moderatorTag: interaction.user.tag,
      moderatorId: interaction.user.id,
      action: "untimeout",
      // target: member.user,
      reason: reason,
      actionId,
    });

    // Embed
    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle("⭕ Timeout Removed")
      .addFields(
        { name: "User", value: member.user.tag, inline: true },
        { name: "Moderator", value: interaction.user.tag, inline: true },
        { name: "Reason", value: reason, inline: false },
        { name: "Log ID", value: `\`${actionId}\`` }
      )
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  },
};
