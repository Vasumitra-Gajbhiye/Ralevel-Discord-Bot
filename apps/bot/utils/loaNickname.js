const { EmbedBuilder } = require("discord.js");

const generateId = require("./generateId.js");
const logModAction = require("./logModAction.js");

const MAX_NICKNAME_LENGTH = 32;
const LOA_SUFFIXES = ["-PLOA", "-LOA"];

function stripLoaSuffix(name) {
  for (const suffix of LOA_SUFFIXES) {
    if (name.endsWith(suffix)) return name.slice(0, -suffix.length);
  }
  return name;
}

function hasLoaSuffix(name) {
  return stripLoaSuffix(name) !== name;
}

async function resolveMember(interaction) {
  const user = interaction.options.getUser("user");
  return (
    interaction.options.getMember("user") ??
    (await interaction.guild.members.fetch(user.id).catch(() => null))
  );
}

/**
 * Shared flow for /mark-loa, /mark-partial-loa and /unmark-loa.
 * @param {"mark-loa" | "mark-partial-loa" | "unmark-loa"} action
 * @param {string | null} suffix "-LOA" / "-PLOA" to apply, or null to remove.
 */
async function changeLoaNickname(interaction, action, suffix) {
  const member = await resolveMember(interaction);

  if (!member) {
    return interaction.reply({
      content: "❌ That user is not in the server.",
      ephemeral: true,
    });
  }

  const oldNickname = member.nickname;
  const currentName = member.displayName;
  let newNickname;

  if (suffix) {
    // Replace an existing LOA tag rather than stacking them.
    const base = stripLoaSuffix(currentName).slice(
      0,
      MAX_NICKNAME_LENGTH - suffix.length,
    );
    newNickname = `${base}${suffix}`;
  } else {
    if (!hasLoaSuffix(currentName)) {
      return interaction.reply({
        content: "❌ That user is not marked as LOA.",
        ephemeral: true,
      });
    }
    const base = stripLoaSuffix(currentName);
    // Nothing to restore if they had no nickname before being marked.
    newNickname = base === member.user.displayName ? null : base;
  }

  try {
    await member.setNickname(newNickname);
  } catch (error) {
    console.error(`[ERROR] /${action} failed to set nickname:`, error);
    return interaction.reply({
      content: "❌ I couldn't change that user's nickname.",
      ephemeral: true,
    });
  }

  const actionId = generateId();

  await logModAction({
    interaction,
    userId: member.user.id,
    userTag: member.user.tag,
    moderatorTag: interaction.user.tag,
    moderatorId: interaction.user.id,
    action,
    reason: "N/A",
    actionId,
    oldNickname,
    newNickname,
  });

  const shownNickname = newNickname ?? "*(none — reset to username)*";
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("📝 Nickname Updated")
    .addFields(
      { name: "User", value: member.user.tag, inline: true },
      { name: "New Nickname", value: shownNickname, inline: true },
      { name: "Moderator", value: interaction.user.tag, inline: true },
      { name: "Log ID", value: `\`${actionId}\`` },
    )
    .setTimestamp();

  return interaction.reply({ embeds: [embed] });
}

module.exports = { changeLoaNickname };
