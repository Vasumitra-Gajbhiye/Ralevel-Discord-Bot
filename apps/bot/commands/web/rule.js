const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const {
  getRule,
  getSection,
  getMeta,
  hasCache,
  normalizeRuleId,
  autocompleteRules,
  REGULATIONS_URL,
} = require("../../systems/ruleSync");
const {
  RULE_EMBED_COLOR,
  DESC_LIMIT,
  formatSyncedFooter,
  buildRuleEmbed,
  ruleNotFoundHint,
} = require("../../utils/ruleEmbed");

function buildSectionEmbeds(section, meta) {
  const blocks = section.ruleIds.map((id) => {
    const rule = getRule(id);
    if (!rule) return `**${id}**`;
    return `**${id} — ${rule.title}**\n${rule.body}`;
  });

  /** @type {string[]} */
  const chunks = [];
  let current = "";

  for (const block of blocks) {
    const next = current ? `${current}\n\n${block}` : block;
    if (next.length > DESC_LIMIT) {
      if (current) chunks.push(current);
      // Single rule longer than the limit (unlikely) — hard truncate
      current =
        block.length > DESC_LIMIT
          ? `${block.slice(0, DESC_LIMIT - 1)}…`
          : block;
    } else {
      current = next;
    }
  }
  if (current) chunks.push(current);

  const footer = formatSyncedFooter(meta);
  const title = `Section ${section.id} — ${section.title}`;

  return chunks.map((description, index) => {
    const embed = new EmbedBuilder()
      .setColor(RULE_EMBED_COLOR)
      .setDescription(description);

    if (index === 0) {
      embed.setTitle(title);
    }
    if (index === chunks.length - 1) {
      embed.setFooter({ text: footer });
    }
    return embed;
  });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("rule")
    .setDescription("Look up an r/alevel Discord regulation by number")
    .addStringOption((option) =>
      option
        .setName("number")
        .setDescription("Rule or section number (e.g. 1.1 or 1)")
        .setRequired(true)
        .setAutocomplete(true),
    ),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused();
    const choices = autocompleteRules(focused);
    await interaction.respond(choices);
  },

  async execute(interaction) {
    if (!hasCache()) {
      return interaction.reply({
        content:
          `❌ Regulations are temporarily unavailable. See the full list: <${REGULATIONS_URL}>`,
        ephemeral: true,
      });
    }

    const raw = interaction.options.getString("number", true);
    const id = normalizeRuleId(raw);
    const meta = getMeta();

    // Prefer exact rule match (e.g. 1.1) over section (e.g. 1)
    const rule = getRule(id);
    if (rule) {
      return interaction.reply({ embeds: [buildRuleEmbed(rule, meta)] });
    }

    const section = getSection(id);
    if (section) {
      return interaction.reply({ embeds: buildSectionEmbeds(section, meta) });
    }

    return interaction.reply({
      content: `❌ No regulation found for \`${id}\`.${ruleNotFoundHint(id)}`,
      ephemeral: true,
    });
  },
};
