const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} = require("discord.js");
const logModAction = require("../../utils/logModAction");

const generateId = require("../../utils/generateId.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("add-role")
    .setDescription("Add a role to a user.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)

    .addUserOption((opt) =>
      opt
        .setName("user")
        .setDescription("User to give the role to.")
        .setRequired(true)
    )

    .addRoleOption((opt) =>
      opt
        .setName("role")
        .setDescription("Role you want to add.")
        .setRequired(true)
    )

    .addStringOption((opt) =>
      opt
        .setName("reason")
        .setDescription("Reason for adding the role.")
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

    // Check if bot can assign role
    if (role.position >= interaction.guild.members.me.roles.highest.position) {
      return interaction.reply({
        content: "❌ I cannot add that role (my role is lower).",
        ephemeral: true,
      });
    }

    // Check if user already has role
    if (member.roles.cache.has(role.id)) {
      return interaction.reply({
        content: "❌ User already has that role.",
        ephemeral: true,
      });
    }

    // Add role
    try {
      await member.roles.add(role, reason);
    } catch {
      return interaction.reply({
        content: "❌ Failed to add role. Check my permissions.",
        ephemeral: true,
      });
    }

    // Log entry
    const actionId = generateId();
    await logModAction({
      interaction,
      userId: member.user.id,
      userTag: member.user.tag,
      moderatorTag: interaction.user.tag,
      moderatorId: interaction.user.id,
      action: "role-add",
      targetTag: member.user.tag,
      reason,
      actionId,
      role: role.name,
    });
    // Confirmation embed
    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle("✅ Role Added")
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
