const { VerbalWarning } = require("@ralevel/db");
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const crypto = require("crypto");
const logModAction = require("../../utils/logModAction");
const {
  getRule,
  getMeta,
  hasCache,
  normalizeRuleId,
  autocompleteRules,
  REGULATIONS_URL,
} = require("../../systems/ruleSync");
const { buildRuleEmbed, ruleNotFoundHint } = require("../../utils/ruleEmbed");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("verbal-warn")
    .setDescription("Give a user a verbal warning (DMed, no moderation points).")
    .addUserOption((opt) =>
      opt.setName("user").setDescription("User to warn").setRequired(true),
    )
    .addStringOption((opt) =>
      opt
        .setName("reason")
        .setDescription("Reason for the verbal warning")
        .setRequired(true)
        .setMaxLength(1024),
    )
    .addStringOption((opt) =>
      opt
        .setName("rule")
        .setDescription("Rule number to include in the DM (e.g. 1.1)")
        .setRequired(false)
        .setAutocomplete(true),
    ),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused();
    await interaction.respond(
      autocompleteRules(focused, 25, { rulesOnly: true }),
    );
  },

  async execute(interaction) {
    await interaction.deferReply();

    const user = interaction.options.getUser("user");
    const reason = interaction.options.getString("reason");
    const rawRule = interaction.options.getString("rule");

    let rule = null;
    if (rawRule) {
      if (!hasCache()) {
        return interaction.editReply({
          content: `❌ Regulations are temporarily unavailable, so the rule can't be attached. Try again without \`rule\`, or see <${REGULATIONS_URL}>.`,
        });
      }
      const ruleId = normalizeRuleId(rawRule);
      rule = getRule(ruleId);
      if (!rule) {
        return interaction.editReply({
          content: `❌ No rule found for \`${ruleId}\`.${ruleNotFoundHint(ruleId)}`,
        });
      }
    }

    const actionId = crypto.randomUUID();
    const ruleLabel = rule ? `${rule.id} — ${rule.title}` : null;

    await VerbalWarning.create({
      userId: user.id,
      userTag: user.tag,
      moderatorId: interaction.user.id,
      moderatorTag: interaction.user.tag,
      reason,
      ruleId: rule?.id ?? null,
      ruleTitle: rule?.title ?? null,
      actionId,
    });

    // DM the user; unlike /warn, report back if it couldn't be delivered
    const dmEmbed = new EmbedBuilder()
      .setTitle("🗣️ Verbal warning in r/Alevel")
      .setColor("Yellow")
      .setDescription(
        "This is a verbal warning. It does not add moderation points, but please take it on board.",
      )
      .addFields({ name: "Reason", value: reason })
      .setTimestamp();
    if (ruleLabel) dmEmbed.addFields({ name: "Rule", value: ruleLabel });

    const dmEmbeds = [dmEmbed];
    if (rule) dmEmbeds.push(buildRuleEmbed(rule, getMeta()));

    let dmSent = true;
    try {
      await user.send({ embeds: dmEmbeds });
    } catch {
      dmSent = false;
    }

    // Log action (DB + channel)
    await logModAction({
      interaction,
      userId: user.id,
      userTag: user.tag,
      moderatorTag: interaction.user.tag,
      moderatorId: interaction.user.id,
      action: "verbal-warn",
      reason,
      actionId,
      rule: ruleLabel ?? "None",
    });

    // Confirmation embed
    const embed = new EmbedBuilder()
      .setTitle("User Verbally Warned ✅")
      .setColor("Yellow")
      .addFields(
        { name: "User", value: `<@${user.id}>`, inline: true },
        { name: "Reason", value: reason, inline: true },
        { name: "Rule", value: ruleLabel ?? "None", inline: true },
        {
          name: "DM Delivered",
          value: dmSent ? "✅ Yes" : "❌ No (DMs closed)",
          inline: true,
        },
        { name: "Action ID", value: actionId, inline: false },
      )
      .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
  },
};
