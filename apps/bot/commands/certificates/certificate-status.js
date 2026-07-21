const { Certificate } = require("@ralevel/db");
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const {
  getGuildConfig,
  resolveRoleKeys,
} = require("../../utils/guildConfigStore");

function memberHasCertModRole(member) {
  const cfg = getGuildConfig();
  const ids = [
    ...resolveRoleKeys(cfg.certificates?.modRoleKeys || []),
    ...(cfg.certificates?.extraModRoleIds || []),
  ];
  return ids.some((id) => member?.roles?.cache?.has(id));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("certificate-status")
    .setDescription("View certificate application status")
    .addStringOption(opt =>
      opt.setName("application_id")
        .setDescription("Application ID to search")
        .setRequired(true)
    ),

  async execute(interaction) {
    const targetUser = interaction.options.getUser("user");
    const applicationId = interaction.options.getString("application_id");

    const isMod = memberHasCertModRole(interaction.member);

    // =========================================================
    // 1️⃣ If searching by application ID
    // =========================================================
    if (applicationId) {
      const app = await Certificate.findById(applicationId);

      if (!app) {
        return interaction.reply({
          content: "❌ No application found with that ID.",
          ephemeral: true,
        });
      }

      // Non-mods can only view their own
      if (!isMod && app.userId !== interaction.user.id) {
        return interaction.reply({
          content: "❌ You can only view your own applications.",
          ephemeral: true,
        });
      }

      // const getHelpChannel = interaction.client.channels.cache.get("1325384293970870292")

      const embed = new EmbedBuilder()
        .setTitle(`📄 Certificate Application — ${app._id}`)
        .setColor("#5865F2")
        .addFields(
          { name: "User", value: `${app.userTag} (${app.userId})` },
          { name: "Type", value: app.type },
          { name: "Status", value: app.status },
          { name: "Rep at Submission", value: `${app.rep}` },
          { name: "Submitted", value: `<t:${Math.floor(app.createdAt.getTime() / 1000)}:F>` }
        ).setFooter(
          {text:`Feel free to open a ticket from the "get-support" channel if you need any help!`}
        );

      if (app.resolvedAt) {
        embed.addFields({
          name: "Resolved",
          value: `<t:${Math.floor(app.resolvedAt.getTime() / 1000)}:F>`,
        });
      }

       if (app.detailsSubmittedAt) {
        embed.addFields({
          name: "Details Submitted",
          value: `<t:${Math.floor(app.detailsSubmittedAt.getTime() / 1000)}:F>`,
        });
      }

       if (app.deliveredAt) {
        embed.addFields({
          name: "Delivered at",
          value: `<t:${Math.floor(app.deliveredAt.getTime() / 1000)}:F>`,
        });
      }

      if (app.reason) {
        embed.addFields({
          name: "Moderator Reason",
          value: app.reason.slice(0, 1024),
        });
      }

      // ✅ Always show these two fields
      embed.addFields(
        {
          name: "Legal Name",
          value: app.legalName && app.legalName.trim() ? app.legalName : "Not yet submitted",
        },
        {
          name: "Email",
          value: app.email && app.email.trim() ? app.email : "Not yet submitted",
        },
      );

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

  },
};