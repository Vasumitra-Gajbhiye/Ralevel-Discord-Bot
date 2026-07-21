// commands/reject-certificate.js
const { Certificate } = require("@ralevel/db");
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require("discord.js");
require("../../loadEnv");

const ADMIN_ROLE_ID = process.env.ADMIN_ROLE_ID;
const REVIEW_CHANNEL = process.env.REVIEW_CHANNEL;

const CERT_UPDATES_CHANNEL = process.env.CERT_UPDATES_CHANNEL; // Public certificate updates channel

module.exports = {
  data: new SlashCommandBuilder()
    .setName("reject-certificate")
    .setDescription("Reject a certificate application (admin only)")
    .addStringOption(opt =>
      opt.setName("applicationid")
        .setDescription("The application ID to reject")
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName("reason")
        .setDescription("Reason for rejection")
        .setRequired(true)
    ).setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  async execute(interaction) {
    if (!interaction.member.roles.cache.has(ADMIN_ROLE_ID)) {
      return interaction.reply({ content: "❌ Only admins can use this command.", ephemeral: true });
    }

    const appId = interaction.options.getString("applicationid");
    const reason = interaction.options.getString("reason");

    const app = await Certificate.findById(appId);

    if (!app)
      return interaction.reply({ content: "❌ Application not found.", ephemeral: true });

    if (app.status !== "pending")
      return interaction.reply({ content: "⚠️ This application has already been processed.", ephemeral: true });

    // save to DB
    app.status = "rejected";
    app.reason = reason;
    app.moderatorId = interaction.user.id;
    app.resolvedAt = new Date();
    await app.save();
          await interaction.deferReply({ ephemeral: true });

    // DM applicant
    try {
      const u = await interaction.client.users.fetch(app.userId);

      await u.send({
        embeds: [
                  new EmbedBuilder()
                    .setTitle("❌ Certificate Application — Rejected")
                    .setDescription(`Your application for **${app.type}** was rejected.`)
                    .addFields(
                      { name: "Reason", value: reason.slice(0, 1024) },
                      { name: "Application ID", value: `\`${app._id}\``, inline: true }
                    )
                    .setColor("#ff4d4d")
                    .setTimestamp()
                ]
      }).catch(() => {});
    } catch {
       // Send update 
              try {
                const updatesCh = await client.channels.fetch(CERT_UPDATES_CHANNEL);
                const applicantUser = await client.users.fetch(app.userId);
    
                const updateEmbed =  new EmbedBuilder()
                    .setTitle("❌ Certificate Application — Rejected")
                    .setDescription(`Your application for **${app.type}** was rejected.`)
                    .addFields(
                      { name: "Reason", value: reason.slice(0, 1024) },
                      { name: "Application ID", value: `\`${app._id}\``, inline: true }
                    )
                    .setColor("#ff4d4d")
                  .setFooter({ text: "You're seeing updates here because your DMs are closed or restricted." })
                  .setTimestamp();
    
                await updatesCh.send({
                  content: `<@${applicantUser.id}>`, // 👈 ping the user
                  embeds: [updateEmbed]
                });
              } catch (err) {
                console.error(err);
              }
    }

   

            //  await interaction.reply({ content: `✅ Application \`${app._id}\` by **${app.userTag}** has been rejected by **${interaction.user.tag}**.\nReason: ${reason}` });

             await interaction.editReply({ content: `✅ Rejected` }); 
             
                       try {
                         const reviewCh = await interaction.client.channels.fetch(REVIEW_CHANNEL).catch(() => null);
                         if (reviewCh) {
                           const embed = new EmbedBuilder()
                           .setTitle("✅ Certificate Application Rejected")
                           .setDescription(
                             `Application ID: \`${app._id}\`\n
                              Moderator: ${interaction.user.tag} \n
                              Reason: ${reason}
                             `
                           ).setColor("#ff4d4d")
                           .setTimestamp()
                           await reviewCh.send({
                           embeds: [embed]
                         });
                         }
                       } catch (err) {console.log(err)}
  }
};