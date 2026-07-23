const {
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require("discord.js");
const { syncCertPanel } = require("../../utils/certPanel");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("send-cert-msg")
    .setDescription("Resync the certificate application panel now")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const result = await syncCertPanel(interaction.client);

    if (!result.ok) {
      const messages = {
        feature_disabled: "❌ Certificates are disabled in guild config.",
        no_channel:
          "❌ No certificate panel channel configured. Set it in the web dashboard under Settings → Certificates.",
        invalid_channel:
          "❌ The configured certificate panel channel was not found or is not a text channel.",
        missing_permissions:
          "❌ I need View Channel, Send Messages, and Embed Links in the configured panel channel.",
      };

      return interaction.editReply({
        content:
          messages[result.reason] ||
          "❌ Failed to sync the certificate application panel.",
      });
    }

    return interaction.editReply({
      content: `✅ Certificate application panel synced in <#${result.channelId}> (message \`${result.messageId}\`).`,
    });
  },
};
