/**
 * Validates whether a moderator may assign or remove a specific role on a target member.
 * @returns {{ message: string } | null} Error to reply with, or null if allowed
 */
function checkRoleAssignment(interaction, targetMember, role) {
  if (!targetMember || !role || !interaction.member) return null;

  if (targetMember.id === interaction.user.id) {
    return { message: "❌ You cannot add or remove roles on yourself." };
  }

  if (role.position >= interaction.member.roles.highest.position) {
    return {
      message:
        "❌ You cannot assign or remove a role that is equal to or above your highest role.",
    };
  }

  return null;
}

module.exports = checkRoleAssignment;
