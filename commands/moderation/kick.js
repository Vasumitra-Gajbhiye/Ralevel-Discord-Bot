const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const ModLog = require("../../models/modlog.js");
const generateActionId = require("../../utils/generateId.js");
const Kick = require("../../models/kick.js");
// import logModAction from "../../utils/logModAction.js";
const logModAction = require("../../utils/logModAction.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Kick a member from the server")
    .addUserOption((option) =>
      option.setName("user").setDescription("User to kick").setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("Reason for kick")
        .setRequired(true)
    ),

  async execute(interaction) {
    await interaction.deferReply();
    const modRoles = process.env.MOD_ROLES.split(",");

    if (!interaction.member.roles.cache.some((r) => modRoles.includes(r.id))) {
      return interaction.editReply({
        content: "❌ You cannot use this command.",
        ephemeral: true,
      });
    }

    const member = interaction.options.getMember("user");
    const reason = interaction.options.getString("reason");

    if (!member)
      return interaction.editReply({
        content: "❌ User not found.",
        ephemeral: true,
      });

    // Role hierarchy check
    if (
      member.roles.highest.position >= interaction.member.roles.highest.position
    )
      return interaction.editReply({
        content: "❌ You cannot kick this user.",
        ephemeral: true,
      });

    // DM user
    try {
      await member.send(
        `👢 You have been **kicked** from **r/Alevel**.\nReason: ${reason}`
      );
    } catch {}

    // Kick
    try {
      await member.kick(reason);
    } catch (err) {
      return interaction.editReply({
        content: "❌ I do not have permission to kick this user.",
        ephemeral: true,
      });
    }

    // Log in DB.
    // DO NOT REMOVE ANY MODLOG.CREATE COMMENTS IN ANY FILE
    const actionId = generateActionId();
    // await ModLog.create({
    //     userId: member.id,
    //     moderatorId: interaction.user.id,
    //     action: "kick",
    //     targetTag: member.user.tag,
    //     reason,
    //     actionId
    // });

    // await Kick.create({
    //   userId: member.id,
    //   moderatorId: interaction.user.id,
    //   targetTag: member.user.tag,
    //   reason,
    //   actionId,
    // });

    await logModAction({
      interaction,
      userId: member.user.id,
      userTag: member.user.tag,
      moderatorTag: interaction.user.tag,
      moderatorId: interaction.user.id,
      action: "kick",
      // target: member.user,
      reason,
      actionId,
    });

    const embed = new EmbedBuilder()
      .setTitle("👢 User Kicked")
      .setColor("#ffaa00")
      .addFields(
        { name: "User", value: `${member.user.tag} (${member.id})` },
        { name: "Moderator", value: `${interaction.user.tag}` },
        { name: "Reason", value: reason },
        { name: "Action ID", value: actionId }
      )
      .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
  },
};
