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
    .setName("remove-role")
    .setDescription("Remove a role from a user.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)

    .addUserOption((opt) =>
      opt
        .setName("user")
        .setDescription("User to remove the role from.")
        .setRequired(true)
    )

    .addRoleOption((opt) =>
      opt
        .setName("role")
        .setDescription("Role you want to remove.")
        .setRequired(true)
    )

    .addStringOption((opt) =>
      opt
        .setName("reason")
        .setDescription("Reason for removing the role.")
        .setRequired(true)
    ),

  async execute(interaction) {
    const member = interaction.options.getMember("user");
    const role = interaction.options.getRole("role");
    const reason = interaction.options.getString("reason");

    if (!member) {
      return interaction.reply({
        content: "❌ That user is not in the server.",
        ephemeral: true,
      });
    }

    // Check if bot can remove role
    if (role.position >= interaction.guild.members.me.roles.highest.position) {
      return interaction.reply({
        content: "❌ I cannot remove that role (my role is lower).",
        ephemeral: true,
      });
    }

    // User must have the role
    if (!member.roles.cache.has(role.id)) {
      return interaction.reply({
        content: "❌ User does not have that role.",
        ephemeral: true,
      });
    }

    // Remove the role
    await member.roles.remove(role, reason).catch(() => {});

    // Log entry
    const actionId = generateId();
    const logReason = `
Action: Role Remove
User: ${member.user.tag}
User ID: ${member.id}
Role Removed: ${role.name}
Moderator: ${interaction.user.tag}
Reason: ${reason}
`.trim();

    // DO NOT REMOVE ANY MODLOG.CREATE COMMENTS IN ANY FILE

    // await ModLog.create({
    //   userId: member.id,
    //   targetChannel: "N/A",
    //   moderatorId: interaction.user.id,
    //   action: "role-remove",
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
      action: "role-remove",
      reason: reason,
      actionId,
      role: role.name,
    });

    // Confirmation embed
    const embed = new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle("❌ Role Removed")
      .addFields(
        { name: "User", value: member.user.tag, inline: true },
        { name: "Role", value: role.name, inline: true },
        { name: "Moderator", value: interaction.user.tag, inline: true },
        { name: "Reason", value: reason, inline: false },
        { name: "Log ID", value: `\`${actionId}\`` }
      )
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  },
};
