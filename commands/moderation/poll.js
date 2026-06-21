const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const Poll = require("../../models/poll");
const { getNextPollId } = require("../../utils/getNextPollId");
const { parseAndValidatePollRoles } = require("../../utils/parsePollRoles");
const { parsePollDeadline } = require("../../utils/parsePollDeadline");
const canViewPollBreakdown = require("../../utils/canViewPollBreakdown");
const getPollVotes = require("../../utils/getPollVotes");
const {
  buildPollEmbed,
  buildBreakdownEmbed,
  buildPollButtons,
  buildRolePingContent,
} = require("../../utils/pollDisplay");
const { wakePollSweeper } = require("../../utils/pollSweeper");

const MIN_OPTIONS = 2;
const MAX_OPTIONS = 24;

function parseOptions(input) {
  return input
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("poll")
    .setDescription("Create and manage server polls")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand((sub) =>
      sub
        .setName("create")
        .setDescription("Create a new poll")
        .addStringOption((opt) =>
          opt
            .setName("question")
            .setDescription("Poll question")
            .setRequired(true),
        )
        .addStringOption((opt) =>
          opt
            .setName("options")
            .setDescription("Comma-separated options (2–24)")
            .setRequired(true),
        )
        .addStringOption((opt) =>
          opt
            .setName("voter_roles")
            .setDescription("Role mentions/IDs allowed to vote (space-separated)")
            .setRequired(true),
        )
        .addStringOption((opt) =>
          opt
            .setName("choice_type")
            .setDescription("Single or multiple choice")
            .setRequired(true)
            .addChoices(
              { name: "Single choice", value: "single" },
              { name: "Multiple choice", value: "multiple" },
            ),
        )
        .addStringOption((opt) =>
          opt
            .setName("deadline")
            .setDescription('Optional deadline (e.g. "2h", "1d", or ISO datetime)'),
        )
        .addChannelOption((opt) =>
          opt
            .setName("channel")
            .setDescription("Channel to post the poll in (defaults to current)"),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("breakdown")
        .setDescription("View who voted for what (staff only)")
        .addIntegerOption((opt) =>
          opt
            .setName("poll_id")
            .setDescription("Poll ID shown in the poll footer")
            .setRequired(true),
        ),
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "create") {
      return handleCreate(interaction);
    }

    if (subcommand === "breakdown") {
      return handleBreakdown(interaction);
    }
  },
};

async function handleCreate(interaction) {
  const question = interaction.options.getString("question");
  const optionsRaw = interaction.options.getString("options");
  const voterRolesRaw = interaction.options.getString("voter_roles");
  const choiceType = interaction.options.getString("choice_type");
  const deadlineRaw = interaction.options.getString("deadline");
  const channel =
    interaction.options.getChannel("channel") || interaction.channel;

  const optionLabels = parseOptions(optionsRaw);

  if (optionLabels.length < MIN_OPTIONS) {
    return interaction.reply({
      content: `❌ Provide at least ${MIN_OPTIONS} options, separated by commas.`,
      ephemeral: true,
    });
  }

  if (optionLabels.length > MAX_OPTIONS) {
    return interaction.reply({
      content: `❌ Maximum ${MAX_OPTIONS} options allowed (Discord button limit).`,
      ephemeral: true,
    });
  }

  const { roleIds, invalidIds } = parseAndValidatePollRoles(
    interaction.guild,
    voterRolesRaw,
  );

  if (roleIds.length === 0) {
    return interaction.reply({
      content:
        "❌ No valid voter roles found. Use role mentions (`@Role`) or role IDs separated by spaces.",
      ephemeral: true,
    });
  }

  if (invalidIds.length > 0) {
    // Non-fatal: proceed with valid roles only
    console.warn(
      `Poll create: ignored invalid role IDs: ${invalidIds.join(", ")}`,
    );
  }

  let deadline = null;
  if (deadlineRaw) {
    const { date, error } = parsePollDeadline(deadlineRaw);
    if (error) {
      return interaction.reply({ content: `❌ ${error}`, ephemeral: true });
    }
    deadline = date;
  }

  if (!channel.isTextBased()) {
    return interaction.reply({
      content: "❌ Polls can only be posted in text channels.",
      ephemeral: true,
    });
  }

  await interaction.deferReply({ ephemeral: true });

  const pollId = await getNextPollId();
  const options = optionLabels.map((label, index) => ({
    id: String(index),
    label,
  }));

  const poll = await Poll.create({
    pollId,
    guildId: interaction.guild.id,
    channelId: channel.id,
    question,
    options,
    allowedRoleIds: roleIds,
    choiceType,
    deadline,
    createdBy: interaction.user.id,
  });

  const embed = buildPollEmbed(poll, interaction.guild);
  const components = buildPollButtons(poll);
  const pingContent = buildRolePingContent(roleIds);

  try {
    const message = await channel.send({
      content: `📢 **New poll — please vote!**\n${pingContent}`,
      embeds: [embed],
      components,
      allowedMentions: { roles: roleIds },
    });

    poll.messageId = message.id;
    await poll.save();

    if (deadline) {
      wakePollSweeper();
    }

    return interaction.editReply({
      content: `✅ Poll **#${pollId}** created in ${channel}.`,
    });
  } catch (err) {
    await Poll.deleteOne({ pollId });
    console.error("Poll create error:", err);
    return interaction.editReply({
      content:
        "❌ Failed to post the poll message. Check bot permissions in that channel.",
    });
  }
}

async function handleBreakdown(interaction) {
  if (!canViewPollBreakdown(interaction.member)) {
    return interaction.reply({
      content:
        "❌ Only staff above trial mod can view the voter breakdown.",
      ephemeral: true,
    });
  }

  const pollId = interaction.options.getInteger("poll_id");
  const poll = await Poll.findOne({
    pollId,
    guildId: interaction.guild.id,
  });

  if (!poll) {
    return interaction.reply({
      content: `❌ No poll found with ID **${pollId}**.`,
      ephemeral: true,
    });
  }

  const votes = await getPollVotes(poll);
  const embed = buildBreakdownEmbed(poll, votes);

  return interaction.reply({
    embeds: [embed],
    ephemeral: true,
  });
}
