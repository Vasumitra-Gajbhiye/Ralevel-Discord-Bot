/**
 * Seed sample definitions for testing /define and friends. Idempotent: terms
 * that already exist in the same subject and board are skipped.
 *
 * Usage from repo root (with .env loaded):
 *   node apps/bot/scripts/seed-definitions.js
 *   node apps/bot/scripts/seed-definitions.js --author=<discord user id>
 *   node apps/bot/scripts/seed-definitions.js --clear   # remove seeded definitions
 *
 * Seeded definitions are credited to --author (default: the bot, CLIENT_ID).
 * Seed as yourself to test editing your own definitions as a helper.
 */
require("../loadEnv");

const {
  connectDB,
  GuildConfig,
  Definition,
  migrateGuildConfigDocument,
  normalizeTermKey,
} = require("@ralevel/db");
const { getNextSequenceId } = require("../utils/getNextSequenceId");

const SAMPLES = [
  // Physics
  { subjectId: "physics", boardId: "caie", term: "Specific heat capacity", chapter: "Thermal physics", views: 42,
    definition: "The energy required per unit mass of a substance to raise its temperature by one kelvin." },
  { subjectId: "physics", boardId: "edexcel", term: "Specific heat capacity", chapter: "Thermal energy", views: 12,
    definition: "The energy needed to raise the temperature of 1 kg of a substance by 1 K without a change of state." },
  { subjectId: "physics", boardId: "", term: "Specific latent heat of fusion", chapter: "Thermal physics", views: 18,
    definition: "The energy required per unit mass to change a substance from solid to liquid without any change in temperature." },
  { subjectId: "physics", boardId: "caie", term: "Electromotive force (e.m.f.)", chapter: "D.C. circuits", views: 35,
    definition: "The energy transferred per unit charge from other forms into electrical energy when charge moves round a complete circuit." },
  { subjectId: "physics", boardId: "caie", term: "Potential difference", chapter: "Electricity", views: 30,
    definition: "The energy transferred per unit charge from electrical energy into other forms when charge passes between two points." },
  { subjectId: "physics", boardId: "", term: "Moment of a force", chapter: "Forces, density and pressure", topic: "Turning effects of forces", views: 25,
    definition: "The product of the force and the perpendicular distance of its line of action from the pivot." },
  { subjectId: "physics", boardId: "", term: "Young modulus", chapter: "Deformation of solids", views: 20,
    definition: "The ratio of tensile stress to tensile strain for a material, within its limit of proportionality." },
  { subjectId: "physics", boardId: "", term: "Coherence", chapter: "Superposition", views: 9,
    definition: "Two wave sources are coherent if they have a constant phase difference." },
  { subjectId: "physics", boardId: "", term: "Half-life", chapter: "Nuclear physics", views: 15,
    definition: "The time taken for the number of undecayed nuclei (or the activity) of a radioactive isotope to fall to half its original value." },

  // Chemistry
  { subjectId: "chemistry", boardId: "caie", term: "First ionisation energy", chapter: "Electrons in atoms", views: 28,
    definition: "The energy needed to remove one electron from each atom in one mole of gaseous atoms to form one mole of gaseous 1+ ions." },
  { subjectId: "chemistry", boardId: "", term: "Electronegativity", chapter: "Chemical bonding", views: 22,
    definition: "The power of an atom to attract the pair of electrons in a covalent bond towards itself." },
  { subjectId: "chemistry", boardId: "", term: "Standard enthalpy change of combustion", chapter: "Chemical energetics", views: 16,
    definition: "The enthalpy change when one mole of a substance is burned completely in excess oxygen under standard conditions, with all reactants and products in their standard states." },
  { subjectId: "chemistry", boardId: "", term: "Half-life", chapter: "Reaction kinetics", views: 7,
    definition: "The time taken for the concentration of a reactant to fall to half of its initial value." },
  { subjectId: "chemistry", boardId: "", term: "Oxidation", chapter: "Redox", views: 11,
    definition: "Loss of electrons, or an increase in oxidation number." },

  // Biology
  { subjectId: "biology", boardId: "", term: "Osmosis", chapter: "Cell membranes and transport", views: 33,
    definition: "The net movement of water molecules from a region of higher water potential to a region of lower water potential through a partially permeable membrane." },
  { subjectId: "biology", boardId: "", term: "Active transport", chapter: "Cell membranes and transport", views: 14,
    definition: "The movement of molecules or ions across a membrane against their concentration gradient, using carrier proteins and energy from ATP." },
  { subjectId: "biology", boardId: "", term: "Enzyme", chapter: "Enzymes", views: 19,
    definition: "A biological catalyst: a globular protein that speeds up a reaction by lowering its activation energy, without being used up." },

  // Economics
  { subjectId: "economics", boardId: "", term: "Opportunity cost", chapter: "Basic economic ideas", views: 26,
    definition: "The value of the next best alternative given up when a choice is made." },
  { subjectId: "economics", boardId: "", term: "Price elasticity of demand", chapter: "The price system and the microeconomy", views: 21,
    definition: "The responsiveness of quantity demanded to a change in the good's own price.\nPED = % change in quantity demanded ÷ % change in price." },
  { subjectId: "economics", boardId: "", term: "Inflation", chapter: "Macroeconomic policies", views: 13,
    definition: "A sustained increase in the general price level in an economy over time." },

  // Mathematics
  { subjectId: "mathematics", boardId: "", term: "Function", chapter: "Functions", views: 10,
    definition: "A mapping in which every element of the domain maps to exactly one element of the range." },
  { subjectId: "mathematics", boardId: "", term: "Stationary point", chapter: "Differentiation", views: 17,
    definition: "A point on a curve where the gradient is zero, i.e. dy/dx = 0." },

  // Computer Science
  { subjectId: "computer-science", boardId: "", term: "Abstraction", chapter: "Computational thinking", views: 8,
    definition: "Removing unnecessary details from a problem so you can focus on the parts that matter for solving it." },
  { subjectId: "computer-science", boardId: "", term: "Stack", chapter: "Data structures", views: 12,
    definition: "A last-in, first-out (LIFO) data structure: items are added (pushed) and removed (popped) at the top only." },
];

function argValue(name) {
  const prefix = `--${name}=`;
  const arg = process.argv.find((a) => a.startsWith(prefix));
  return arg ? arg.slice(prefix.length).trim() : "";
}

function sampleKey(sample) {
  return {
    subjectId: sample.subjectId,
    boardId: sample.boardId,
    termKey: normalizeTermKey(sample.term),
  };
}

async function main() {
  const guildId = process.env.GUILD_ID;
  const authorId = argValue("author") || process.env.CLIENT_ID;
  if (!guildId || !authorId) {
    console.error("GUILD_ID and CLIENT_ID (or --author=<user id>) are required");
    process.exit(1);
  }

  await connectDB();

  if (process.argv.includes("--clear")) {
    const { deletedCount } = await Definition.deleteMany({
      authorId,
      $or: SAMPLES.map(sampleKey),
    });
    console.log(`Removed ${deletedCount} seeded definitions (author ${authorId}).`);
    process.exit(0);
  }

  // Adds the definitions section (default subjects/boards) to older configs
  await migrateGuildConfigDocument(GuildConfig, guildId);
  const config = await GuildConfig.findOne({ guildId }).lean();
  const subjectIds = new Set((config?.definitions?.subjects || []).map((s) => s.id));
  const boardIds = new Set((config?.definitions?.boards || []).map((b) => b.id));

  let created = 0;
  let skipped = 0;
  for (const sample of SAMPLES) {
    if (!subjectIds.has(sample.subjectId) || (sample.boardId && !boardIds.has(sample.boardId))) {
      console.warn(`Skipping "${sample.term}": ${sample.subjectId}/${sample.boardId || "all"} isn't configured.`);
      skipped += 1;
      continue;
    }
    if (await Definition.exists(sampleKey(sample))) {
      skipped += 1;
      continue;
    }

    await Definition.create({
      definitionId: await getNextSequenceId("definitionId"),
      chapter: "",
      topic: "",
      ...sample,
      authorId,
      authorTag: "Seed data",
    });
    created += 1;
  }

  console.log(`Seeded ${created} definitions (${skipped} skipped) for author ${authorId}.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
