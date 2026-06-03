/**
 * Validates moderator and bot role hierarchy against a target member.
 * @returns {{ message: string } | null} Error to reply with, or null if allowed
 */
function checkRoleHierarchy(interaction, targetMember) {
  if (!targetMember || !interaction.guild || !interaction.member) return null;

  const { guild, member: moderator } = interaction;
  const botMember = guild.members.me;

  const modBlockedMessage =
    "❌ You cannot use this command on a user with an equal or higher role than you.";

  if (targetMember.id === guild.ownerId) {
    return { message: modBlockedMessage };
  }

  if (
    targetMember.roles.highest.position >= moderator.roles.highest.position
  ) {
    return { message: modBlockedMessage };
  }

  if (
    botMember &&
    targetMember.roles.highest.position >= botMember.roles.highest.position
  ) {
    return {
      message: "❌ I cannot perform this action due to role hierarchy.",
    };
  }

  return null;
}

module.exports = checkRoleHierarchy;
