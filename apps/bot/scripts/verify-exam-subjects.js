/**
 * Pure checks for Settings → Exam subjects (GuildConfig.examLocking.subjects),
 * the Cambridge syllabus list and the bot-published ChannelDirectory.
 * Uses stubs only — never connects to Mongo or Discord.
 */
const fs = require("fs");
const path = require("path");
const { ChannelType } = require("discord.js");
const {
  GuildConfig,
  ChannelDirectory,
  buildDefaultGuildConfig,
  buildDefaultExamLocking,
  normalizeExamLockingConfig,
  migrateGuildConfigDocument,
} = require("@ralevel/db");
const {
  CAMBRIDGE_SYLLABUSES,
  CAMBRIDGE_TIMETABLE_SERIES,
  getCambridgeSyllabusName,
} = require("@ralevel/shared/cambridgeSyllabuses");
const channelDirectorySystem = require("../systems/channelDirectory");

const { buildDirectoryChannels } = channelDirectorySystem;

const GUILD = "400000000000000001";
const OTHER_GUILD = "400000000000000002";
const CHANNEL = {
  maths: "500000000000000001",
  mathsForum: "500000000000000002",
  physics: "500000000000000003",
  category: "500000000000000004",
  voice: "500000000000000005",
  thread: "500000000000000006",
  // Shorter snowflake: sorts before the others numerically, after them as a string
  old: "90000000000000001",
};
const TIMETABLE_CSV = path.resolve(
  __dirname,
  "../../../docs/channel-locking-research/cambridge_2026_timetables_parsed.csv",
);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function withStubs(stubs, fn) {
  const originals = [];
  for (const [target, key, value] of stubs) {
    originals.push([target, key, target[key]]);
    target[key] = value;
  }
  try {
    return await fn();
  } finally {
    for (const [target, key, value] of originals.reverse()) target[key] = value;
  }
}

// process.env stringifies assignments, so undefined has to be deleted, not set
async function withGuildId(value, fn) {
  const original = process.env.GUILD_ID;
  const set = (v) => {
    if (v === undefined) delete process.env.GUILD_ID;
    else process.env.GUILD_ID = v;
  };
  set(value);
  try {
    return await fn();
  } finally {
    set(original);
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function errorsOf(input) {
  const result = normalizeExamLockingConfig(input);
  assert(!result.ok, `expected errors for ${JSON.stringify(input)}`);
  return result.errors.join("\n");
}

// ---------------------------------------------------------------------------

function testNormalizeValid() {
  const result = normalizeExamLockingConfig({
    subjects: [
      {
        label: "  Mathematics ",
        syllabusCodes: ["9709", " 9231 ", "9709", ""],
        channels: [
          { id: CHANNEL.maths, label: " #maths " },
          CHANNEL.mathsForum,
          { id: CHANNEL.maths, label: "#dupe" },
        ],
      },
      {
        id: "physics",
        label: "Physics",
        syllabusCodes: ["9702"],
        channels: [{ id: CHANNEL.maths, label: "#maths" }],
        enabled: false,
      },
    ],
    staleKey: true,
  });
  assert(result.ok, `valid config is accepted: ${JSON.stringify(result)}`);

  const [maths, physics] = result.examLocking.subjects;
  assert(maths.id === "mathematics", "missing ID is slugified from the name");
  assert(maths.label === "Mathematics", "name is trimmed");
  assert(
    JSON.stringify(maths.syllabusCodes) === '["9709","9231"]',
    "codes are trimmed, blanks dropped, duplicates removed, order kept",
  );
  assert(maths.channels.length === 2, "duplicate channels are removed");
  assert(maths.channels[0].label === "#maths", "channel labels are trimmed");
  assert(
    maths.channels[1].id === CHANNEL.mathsForum && maths.channels[1].label === "",
    "a bare channel ID is accepted",
  );
  assert(maths.enabled === true, "enabled defaults to true");
  assert(physics.enabled === false, "enabled: false is kept");
  assert(
    physics.channels[0].id === CHANNEL.maths,
    "a channel can belong to several subjects",
  );
  assert(
    Object.keys(result.examLocking).join() === "subjects",
    "unknown keys are dropped",
  );

  for (const raw of [undefined, null, "nope", {}, { subjects: "x" }]) {
    const empty = normalizeExamLockingConfig(raw);
    assert(
      empty.ok && empty.examLocking.subjects.length === 0,
      `${JSON.stringify(raw)} normalizes to no subjects`,
    );
  }
}

function testNormalizeErrors() {
  assert(
    errorsOf({ subjects: [{ label: "  ", syllabusCodes: ["9709"] }] }).includes(
      "needs a name",
    ),
    "a subject without a name is rejected",
  );
  assert(
    errorsOf({ subjects: [{ label: "Maths", syllabusCodes: ["97O9"] }] }).includes(
      'invalid syllabus code "97O9"',
    ),
    "a non-numeric code is rejected",
  );
  assert(
    errorsOf({ subjects: [{ label: "Maths", syllabusCodes: ["970"] }] }).includes(
      "invalid syllabus code",
    ),
    "a three-digit code is rejected",
  );
  assert(
    errorsOf({
      subjects: [{ label: "Maths", channels: [{ id: "maths", label: "#maths" }] }],
    }).includes('invalid channel ID "maths"'),
    "a non-snowflake channel ID is rejected",
  );
  assert(
    errorsOf({ subjects: [{ id: "Bad ID", label: "Maths" }] }).includes("invalid ID"),
    "an ID that isn't a slug is rejected",
  );
  assert(
    errorsOf({
      subjects: [
        { id: "maths", label: "Maths" },
        { id: "maths", label: "Maths again" },
      ],
    }).includes('Duplicate exam subject ID "maths"'),
    "duplicate IDs are rejected",
  );

  const shared = errorsOf({
    subjects: [
      { label: "Mathematics", syllabusCodes: ["9709"] },
      { label: "Further Mathematics", syllabusCodes: ["9231", "9709"] },
    ],
  });
  assert(
    shared.includes('Syllabus 9709 is in both "Mathematics" and "Further Mathematics"'),
    "a syllabus can't belong to two subjects",
  );

  assert(
    errorsOf({
      subjects: [{ label: "Maths", syllabusCodes: Array.from({ length: 31 }, (_, i) => String(9000 + i)) }],
    }).includes("more than 30 syllabus codes"),
    "the per-subject code limit applies",
  );
  assert(
    errorsOf({
      subjects: Array.from({ length: 101 }, (_, i) => ({ label: `Subject ${i}` })),
    }).includes("At most 100 exam subjects"),
    "the subject limit applies",
  );
}

function testDefaultsAndSchema() {
  const a = buildDefaultExamLocking();
  const b = buildDefaultExamLocking();
  assert(Array.isArray(a.subjects) && a.subjects.length === 0, "default has no subjects");
  assert(a.subjects !== b.subjects, "each default gets its own array");

  const defaults = buildDefaultGuildConfig(GUILD);
  assert(
    Array.isArray(defaults.examLocking?.subjects) && defaults.examLocking.subjects.length === 0,
    "new guild configs start with no exam subjects",
  );

  const blank = new GuildConfig({ guildId: GUILD });
  assert(
    blank.examLocking.subjects.length === 0,
    "the schema defaults examLocking.subjects to []",
  );

  const doc = new GuildConfig({
    guildId: GUILD,
    examLocking: {
      subjects: [
        {
          id: "mathematics",
          label: "Mathematics",
          syllabusCodes: ["9709"],
          channels: [{ id: CHANNEL.maths, label: "#maths" }],
        },
      ],
    },
  });
  assert(!doc.validateSync(), "a normalized subject passes schema validation");
  const saved = doc.toObject().examLocking.subjects[0];
  assert(saved.enabled === true, "schema defaults enabled to true");
  assert(saved.channels[0].label === "#maths", "channels are stored as IdLabel");
  assert(saved._id === undefined, "subjects have no _id");
}

async function runMigration(raw) {
  const updates = [];
  const stub = {
    collection: {
      findOne: async () => raw,
      updateOne: async (query, update) => updates.push({ query, update }),
    },
  };
  await migrateGuildConfigDocument(stub, GUILD);
  return updates[0]?.update.$set ?? {};
}

async function testMigration() {
  const missing = await runMigration({ guildId: GUILD });
  assert(
    JSON.stringify(missing.examLocking) === '{"subjects":[]}',
    "a config without examLocking gets the default",
  );

  const partial = await runMigration({ guildId: GUILD, examLocking: {} });
  assert(
    Array.isArray(partial["examLocking.subjects"]) &&
      partial["examLocking.subjects"].length === 0 &&
      partial.examLocking === undefined,
    "an examLocking without subjects gets subjects: [] and keeps its other keys",
  );

  const existing = await runMigration({
    guildId: GUILD,
    examLocking: { subjects: [{ id: "physics", label: "Physics" }] },
  });
  assert(
    existing.examLocking === undefined && existing["examLocking.subjects"] === undefined,
    "existing subjects are left alone",
  );
}

function readTimetableCodes() {
  const [header, ...lines] = fs.readFileSync(TIMETABLE_CSV, "utf8").trim().split("\n");
  const cols = header.split(",");
  const seriesCol = cols.indexOf("series");
  const syllabusCol = cols.indexOf("syllabus");
  const bySeries = {};
  for (const line of lines) {
    // No quoted fields before `syllabus`, so a plain split is enough for these columns
    const fields = line.split(",");
    const code = fields[syllabusCol];
    if (!/^[89]\d{3}$/.test(code)) continue;
    (bySeries[fields[seriesCol]] ??= new Set()).add(code);
  }
  return bySeries;
}

function testSyllabusList() {
  const codes = CAMBRIDGE_SYLLABUSES.map((s) => s.code);
  assert(new Set(codes).size === codes.length, "syllabus codes are unique");
  assert(
    CAMBRIDGE_SYLLABUSES.every((s) => /^[89]\d{3}$/.test(s.code) && s.name.trim()),
    "every entry is an 8xxx/9xxx code with a name",
  );
  assert(
    JSON.stringify(codes) === JSON.stringify([...codes].sort()),
    "the list is sorted by code",
  );
  assert(getCambridgeSyllabusName("9709") === "Mathematics", "9709 is Mathematics");
  assert(getCambridgeSyllabusName(" 9231 ") === "Further Mathematics", "codes are trimmed");
  assert(getCambridgeSyllabusName("0580") === null, "unknown codes return null");

  const nov = CAMBRIDGE_TIMETABLE_SERIES.find((s) => s.id === "november-2026");
  assert(CAMBRIDGE_TIMETABLE_SERIES[0] === nov, "Nov 2026 is the current series");
  assert(nov.syllabusCodes.length === 43, "Nov 2026 has 43 A Level syllabuses (plan §2.5)");

  const known = new Set(codes);
  const fromCsv = readTimetableCodes();
  for (const series of CAMBRIDGE_TIMETABLE_SERIES) {
    assert(
      series.syllabusCodes.every((c) => known.has(c)),
      `every ${series.label} code has a name`,
    );
    const expected = [...(fromCsv[series.id] ?? [])].sort();
    assert(
      JSON.stringify([...series.syllabusCodes].sort()) === JSON.stringify(expected),
      `${series.label} codes match the parsed timetable`,
    );
  }
  const allCsv = new Set(Object.values(fromCsv).flatMap((s) => [...s]));
  assert(
    codes.length === allCsv.size && codes.every((c) => allCsv.has(c)),
    "the list holds exactly the syllabuses timetabled in 2026",
  );
}

// ---------------------------------------------------------------------------

function fakeChannel(id, type, name, { parentId = null, rawPosition = 0, guildId = GUILD } = {}) {
  return {
    id,
    type,
    name,
    parentId,
    rawPosition,
    guildId,
    isThread: () =>
      type === ChannelType.PublicThread ||
      type === ChannelType.PrivateThread ||
      type === ChannelType.AnnouncementThread,
  };
}

function guildChannels() {
  return new Map(
    [
      fakeChannel(CHANNEL.maths, ChannelType.GuildText, "maths", {
        parentId: CHANNEL.category,
        rawPosition: 1,
      }),
      fakeChannel(CHANNEL.mathsForum, ChannelType.GuildForum, "maths-forum", {
        parentId: CHANNEL.category,
        rawPosition: 2,
      }),
      fakeChannel(CHANNEL.category, ChannelType.GuildCategory, "MATHS", { rawPosition: 3 }),
      fakeChannel(CHANNEL.voice, ChannelType.GuildVoice, "study-vc", {
        parentId: CHANNEL.category,
      }),
      fakeChannel(CHANNEL.thread, ChannelType.PublicThread, "p1 help", {
        parentId: CHANNEL.maths,
      }),
      fakeChannel(CHANNEL.old, ChannelType.GuildAnnouncement, "announcements"),
    ].map((c) => [c.id, c]),
  );
}

function testBuildDirectoryChannels() {
  const entries = buildDirectoryChannels(guildChannels());
  assert(entries.length === 5, "threads are left out");
  assert(
    entries.map((e) => e.id).join() ===
      [CHANNEL.old, CHANNEL.maths, CHANNEL.mathsForum, CHANNEL.category, CHANNEL.voice].join(),
    "entries are sorted by snowflake numerically",
  );
  const byId = Object.fromEntries(entries.map((e) => [e.id, e]));
  assert(byId[CHANNEL.maths].type === "text", "text channels are 'text'");
  assert(byId[CHANNEL.mathsForum].type === "forum", "forums are 'forum'");
  assert(byId[CHANNEL.voice].type === "voice", "voice channels are 'voice'");
  assert(byId[CHANNEL.category].type === "category", "categories are 'category'");
  assert(byId[CHANNEL.old].type === "announcement", "announcement channels are 'announcement'");
  assert(
    byId[CHANNEL.maths].parentId === CHANNEL.category && byId[CHANNEL.old].parentId === null,
    "parentId is the category, or null",
  );
  assert(
    byId[CHANNEL.maths].position === 1 && byId[CHANNEL.voice].position === 0,
    "position is the raw position",
  );
  assert(
    Object.keys(byId[CHANNEL.maths]).sort().join() === "id,name,parentId,position,type",
    "entries carry only directory fields",
  );
}

function fakeClient(channels) {
  const listeners = { on: {}, once: {} };
  return {
    listeners,
    on: (event, handler) => ((listeners.on[event] ??= []).push(handler)),
    once: (event, handler) => ((listeners.once[event] ??= []).push(handler)),
    emit: async (event, ...args) => {
      for (const handler of listeners.once[event] ?? []) await handler(...args);
      listeners.once[event] = [];
      for (const handler of listeners.on[event] ?? []) await handler(...args);
    },
    guilds: {
      cache: new Map([[GUILD, { id: GUILD, channels: { cache: channels } }]]),
    },
  };
}

async function testDirectoryPublishing() {
  const writes = [];
  let failNext = false;
  const updateOne = async (query, update, options) => {
    if (failNext) {
      failNext = false;
      throw new Error("mongo down");
    }
    writes.push({ query, update, options });
  };
  const logged = [];
  const quiet = (...args) => logged.push(args);

  await withGuildId(GUILD, () => withStubs(
    [
      [ChannelDirectory, "updateOne", updateOne],
      [console, "error", quiet],
      [console, "warn", quiet],
    ],
    async () => {
      const channels = guildChannels();
      const client = fakeClient(channels);
      const { publish } = channelDirectorySystem(client, { debounceMs: 20 });

      await client.emit("ready");
      await sleep(0);
      assert(writes.length === 1, "the directory is published on ready");
      assert(writes[0].query.guildId === GUILD, "the write is scoped to GUILD_ID");
      assert(writes[0].options.upsert === true, "the first write creates the document");
      assert(
        writes[0].update.$set.channels.length === 5 &&
          Object.keys(writes[0].update.$set).join() === "channels",
        "the write sets only the channel list",
      );

      await publish();
      assert(writes.length === 1, "an unchanged list isn't written again");

      const maths = channels.get(CHANNEL.maths);
      await client.emit("channelUpdate", maths, maths);
      await client.emit("channelCreate", fakeChannel(CHANNEL.thread, ChannelType.PublicThread, "t"));
      await client.emit(
        "channelCreate",
        fakeChannel("600000000000000001", ChannelType.GuildText, "elsewhere", {
          guildId: OTHER_GUILD,
        }),
      );
      await sleep(50);
      assert(writes.length === 1, "no-op updates, threads and other guilds don't write");

      channels.set(CHANNEL.physics, fakeChannel(CHANNEL.physics, ChannelType.GuildText, "physics"));
      await client.emit("channelCreate", channels.get(CHANNEL.physics));
      maths.name = "mathematics";
      await client.emit("channelUpdate", maths, maths);
      channels.delete(CHANNEL.voice);
      await client.emit("channelDelete", fakeChannel(CHANNEL.voice, ChannelType.GuildVoice, "study-vc"));
      assert(writes.length === 1, "changes are debounced");
      await sleep(60);
      assert(writes.length === 2, "a burst of changes is written once");
      const published = writes[1].update.$set.channels;
      assert(
        published.some((c) => c.id === CHANNEL.physics) &&
          !published.some((c) => c.id === CHANNEL.voice) &&
          published.find((c) => c.id === CHANNEL.maths).name === "mathematics",
        "the write reflects creates, renames and deletes",
      );

      channels.set(CHANNEL.voice, fakeChannel(CHANNEL.voice, ChannelType.GuildVoice, "study-vc"));
      failNext = true;
      await publish();
      assert(writes.length === 2, "a failed write is not recorded");
      assert(
        logged.some((args) => String(args[0]).includes("Failed to publish")),
        "a failed write is logged, not thrown",
      );
      await publish();
      assert(writes.length === 3, "the next publish retries after a failure");
    },
  ));

  const noGuildClient = fakeClient(guildChannels());
  await withGuildId(undefined, () =>
    withStubs([[console, "warn", quiet]], async () => {
      channelDirectorySystem(noGuildClient);
      assert(
        Object.keys(noGuildClient.listeners.on).length === 0 &&
          Object.keys(noGuildClient.listeners.once).length === 0,
        "without GUILD_ID nothing is registered",
      );
    }),
  );
}

async function main() {
  testNormalizeValid();
  testNormalizeErrors();
  testDefaultsAndSchema();
  await testMigration();
  testSyllabusList();
  testBuildDirectoryChannels();
  await testDirectoryPublishing();

  console.log("verify-exam-subjects: all checks passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
