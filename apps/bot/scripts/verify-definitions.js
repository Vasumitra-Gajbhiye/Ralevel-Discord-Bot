const {
  Counter,
  Definition,
  DefinitionRequest,
  normalizeTermKey,
  normalizeDefinitionsConfig,
} = require("@ralevel/db");
const definitions = require("../utils/definitions");
const actions = require("../utils/definitionActions");
const definitionsSystem = require("../systems/definitions");
const { setGuildConfig, tryGetGuildConfig } = require("../utils/guildConfigStore");

const ROLE = {
  admin: "100000000000000001",
  hlpHead: "100000000000000002",
  physicsHelper: "100000000000000003",
  chemHelper: "100000000000000004",
};
const USER = {
  helper: "200000000000000001",
  otherHelper: "200000000000000002",
  member: "200000000000000003",
  head: "200000000000000004",
};
const REVIEW_CHANNEL = "300000000000000001";
const LOG_CHANNEL = "300000000000000002";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

/** Mongoose-style query stub: awaitable directly or via chained helpers. */
function query(value) {
  const q = {
    lean: () => q,
    select: () => q,
    sort: () => q,
    limit: () => q,
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
  };
  return q;
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

function testConfig() {
  return {
    roles: [
      { key: "admin", label: "Admin", roleId: ROLE.admin },
      { key: "hlpHead", label: "Helper Head", roleId: ROLE.hlpHead },
      { key: "physicsHelper", label: "Physics Helper", roleId: ROLE.physicsHelper },
      { key: "chemHelper", label: "Chemistry Helper", roleId: ROLE.chemHelper },
    ],
    features: { definitions: true },
    definitions: {
      subjects: [
        { id: "physics", label: "Physics", helperRoleKeys: ["physicsHelper"], enabled: true },
        { id: "chemistry", label: "Chemistry", helperRoleKeys: ["chemHelper"], enabled: true },
        { id: "latin", label: "Latin", helperRoleKeys: [], enabled: false },
      ],
      boards: [
        { id: "caie", label: "Cambridge (CAIE)", enabled: true },
        { id: "edexcel", label: "Edexcel", enabled: true },
      ],
      reviewChannelId: REVIEW_CHANNEL,
      logChannelId: LOG_CHANNEL,
      approverRoleKeys: ["admin", "hlpHead"],
      pingRoleKeys: ["hlpHead"],
      maxPendingPerUser: 2,
    },
  };
}

function member(...roleIds) {
  return { roles: roleIds };
}

function physicsDef(overrides = {}) {
  return {
    definitionId: 7,
    subjectId: "physics",
    boardId: "",
    term: "Specific heat capacity",
    termKey: "specific heat capacity",
    definition: "Energy per unit mass per kelvin.",
    chapter: "Thermal physics",
    topic: "",
    authorId: USER.helper,
    authorTag: "helper",
    contributors: [],
    revision: 3,
    views: 0,
    ...overrides,
  };
}

function makeChannel(channelId) {
  const sent = [];
  return {
    id: channelId,
    sent,
    isTextBased: () => true,
    send: async (payload) => {
      sent.push(payload);
      return { id: `msg-${sent.length}` };
    },
  };
}

function makeClient(channels) {
  const listeners = [];
  const dms = [];
  return {
    listeners,
    dms,
    on: (event, handler) => listeners.push({ event, handler }),
    channels: {
      fetch: async (channelId) => {
        if (channels[channelId]) return channels[channelId];
        throw new Error("Unknown Channel");
      },
    },
    users: {
      fetch: async (userId) => ({
        id: userId,
        send: async (payload) => dms.push({ userId, payload }),
      }),
    },
  };
}

function makeModalInteraction({ client, customId, userId, roles, fields }) {
  const replies = [];
  return {
    replies,
    client,
    customId,
    user: { id: userId, tag: `user-${userId.slice(-2)}` },
    member: member(...roles),
    replied: false,
    deferred: false,
    isButton: () => false,
    isModalSubmit: () => true,
    fields: {
      getTextInputValue: (id) => {
        if (!(id in fields)) throw new Error(`missing field ${id}`);
        return fields[id];
      },
    },
    async deferReply() {
      this.deferred = true;
    },
    async editReply(payload) {
      replies.push(payload);
    },
    async reply(payload) {
      this.replied = true;
      replies.push(payload);
    },
    async followUp(payload) {
      replies.push(payload);
    },
  };
}

// ---------------------------------------------------------------------------

function testNormalisationAndConfig() {
  assert(
    normalizeTermKey("  Specific   HEAT\tcapacity ") === "specific heat capacity",
    "termKey lowercases and collapses whitespace",
  );

  const tooLong = definitions.cleanContent({
    term: "x".repeat(101),
    definition: "ok",
  });
  assert(!tooLong.ok, "terms over 100 characters are rejected");

  const tidy = definitions.cleanContent({
    term: "  Moment  ",
    definition: "Force ×\r\n\r\n\r\n\r\nperpendicular distance  ",
    chapter: null,
  });
  assert(tidy.ok && tidy.content.term === "Moment", "term is trimmed");
  assert(
    tidy.content.definition === "Force ×\n\nperpendicular distance",
    "definition newlines are normalised",
  );

  const cfg = normalizeDefinitionsConfig({
    subjects: [{ label: "Further Maths" }, { id: "further-maths", label: "Dup" }],
    approverRoleKeys: ["admin"],
  });
  assert(!cfg.ok, "duplicate subject IDs are rejected");

  const ok = normalizeDefinitionsConfig({
    subjects: [{ label: "Further Maths", helperRoleKeys: ["a", "a", ""] }],
    boards: [{ id: "caie", label: "CAIE", enabled: false }],
    approverRoleKeys: ["admin"],
    maxPendingPerUser: 3,
  });
  assert(ok.ok, "valid config passes");
  assert(ok.definitions.subjects[0].id === "further-maths", "IDs are slugified from names");
  assert(
    ok.definitions.subjects[0].helperRoleKeys.length === 1,
    "helper role keys are de-duplicated",
  );
  assert(ok.definitions.boards[0].enabled === false, "disabled boards stay disabled");
}

function testPermissions() {
  const def = physicsDef();
  const helper = member(ROLE.physicsHelper);
  const chemHelper = member(ROLE.chemHelper);
  const head = member(ROLE.hlpHead);
  const regular = member();

  assert(definitions.canAddDirectly(helper, "physics"), "physics helper adds physics directly");
  assert(!definitions.canAddDirectly(chemHelper, "physics"), "chemistry helper can't add physics directly");
  assert(definitions.canAddDirectly(head, "chemistry"), "helper head adds anything directly");
  assert(!definitions.canAddDirectly(regular, "physics"), "members go through review");

  assert(
    definitions.canModifyDirectly(helper, USER.helper, def),
    "helper edits their own definition directly",
  );
  assert(
    !definitions.canModifyDirectly(member(ROLE.physicsHelper), USER.otherHelper, def),
    "helper can't directly edit another helper's definition",
  );
  assert(
    definitions.canModifyDirectly(head, USER.head, def),
    "approvers edit any definition directly",
  );
  assert(
    !definitions.canModifyDirectly(regular, USER.helper, def),
    "authors who lost the helper role go through review",
  );
  assert(definitions.isApprover({ roles: { cache: new Map([[ROLE.admin, {}]]) } }), "GuildMember role cache works");
}

function testRefsAndChoices() {
  assert(definitions.parseDefinitionRef("id:42").definitionId === 42, "autocomplete refs parse");
  assert(definitions.parseDefinitionRef("velocity").text === "velocity", "typed text is kept");

  const subjects = definitions.subjectChoices("");
  assert(
    subjects.length === 2 && !subjects.some((c) => c.value === "latin"),
    "disabled subjects are hidden from /add-define",
  );
  assert(
    definitions.subjectChoices("", { enabledOnly: false }).length === 3,
    "/define can still filter by a disabled subject",
  );
  assert(definitions.subjectChoices("chem")[0].value === "chemistry", "subject search matches labels");

  const choice = definitions.definitionChoice(physicsDef({ boardId: "caie" }));
  assert(choice.value === "id:7", "choice value points at the definition ID");
  assert(choice.name === "Specific heat capacity · Physics · Cambridge (CAIE)", "choice shows subject and board");
}

async function testSearchRanking() {
  const docs = [
    { definitionId: 1, term: "Heat of fusion", termKey: "latent heat of fusion x", subjectId: "physics", boardId: "" },
    { definitionId: 2, term: "Heat", termKey: "heat", subjectId: "physics", boardId: "" },
    { definitionId: 3, term: "Heating", termKey: "heating effect", subjectId: "physics", boardId: "" },
    { definitionId: 4, term: "Wheat", termKey: "wheat", subjectId: "biology", boardId: "" },
    { definitionId: 5, term: "Specific heat", termKey: "specific heat", subjectId: "physics", boardId: "" },
  ];
  let seenFilter;
  await withStubs(
    [[Definition, "find", (filter) => ((seenFilter = filter), query(docs))]],
    async () => {
      const results = await definitions.searchDefinitions("Heat", {
        subjectId: "physics",
        boardId: "caie",
      });
      assert(
        results.map((d) => d.definitionId).join(",") === "2,3,1,5,4",
        `results rank exact → prefix → word → anywhere, got ${results.map((d) => d.definitionId)}`,
      );
      assert(seenFilter.subjectId === "physics", "known subject filters the search");
      assert(
        JSON.stringify(seenFilter.boardId) === JSON.stringify({ $in: ["caie", ""] }),
        "board filter includes all-board definitions",
      );

      await definitions.searchDefinitions("x", { subjectId: "not-a-subject" });
      assert(!("subjectId" in seenFilter), "unknown subject text is ignored");

      await definitions.searchDefinitions("a.b(c");
      assert(seenFilter.termKey.$regex === "a\\.b\\(c", "regex characters are escaped");
    },
  );
}

function testEmbeds() {
  const def = physicsDef({
    contributors: [
      { userId: USER.helper, userTag: "helper" },
      { userId: USER.member, userTag: "member" },
      { userId: USER.head, userTag: "head" },
    ],
  });
  const credits = definitions.formatCredits(def);
  assert(credits.startsWith(`Added by <@${USER.helper}>`), "author is credited first");
  assert(
    credits.includes(`Improved by <@${USER.member}>, <@${USER.head}>`),
    "improvers are credited",
  );
  assert(
    (credits.match(new RegExp(USER.helper, "g")) || []).length === 1,
    "author is not repeated as an improver",
  );

  const review = definitions
    .buildReviewEmbed({
      requestId: 9,
      type: "edit",
      status: "pending",
      definitionId: 7,
      subjectId: "physics",
      boardId: "",
      requesterId: USER.member,
      original: { term: "Moment", definition: "old", chapter: "Forces", topic: "" },
      proposed: { term: "Moment", definition: "new", chapter: "Turning effects", topic: "" },
      note: "Used the mark-scheme wording",
    })
    .toJSON();
  const names = review.fields.map((f) => f.name);
  assert(!names.includes("Term"), "unchanged fields are not shown as changes");
  assert(names.includes("Chapter"), "changed chapter is shown");
  assert(
    names.includes("Current definition") && names.includes("Suggested definition"),
    "definition change shows before and after",
  );
  assert(names.includes("What changed"), "requester note is shown");

  const row = definitions.buildReviewRow({ requestId: 9, type: "delete" }).toJSON();
  assert(
    row.components.map((c) => c.custom_id).join(",") ===
      "definition:approve:9,definition:reject:9",
    "deletion requests have no Edit & approve button",
  );

  const modal = definitions.buildEditModal(physicsDef()).toJSON();
  assert(modal.custom_id === "definition:edit-modal:7:3", "edit modal carries the revision");
  assert(modal.components.length === 5, "edit modal has 4 content fields and a note");
}

async function testApproveEditCreditsRequester() {
  const request = {
    requestId: 11,
    type: "edit",
    status: "approved",
    definitionId: 7,
    baseRevision: 3,
    subjectId: "physics",
    boardId: "",
    requesterId: USER.member,
    requesterTag: "member",
    proposed: { term: "Specific heat capacity", definition: "Better.", chapter: "", topic: "" },
  };
  let appliedUpdate;
  await withStubs(
    [
      [DefinitionRequest, "findOneAndUpdate", (filter) => query(filter.status === "pending" ? request : { ...request })],
      [Definition, "findOne", () => query(physicsDef())],
      [
        Definition,
        "findOneAndUpdate",
        (filter, update) => {
          appliedUpdate = { filter, update };
          return query({ ...physicsDef(), definition: "Better.", revision: 4 });
        },
      ],
    ],
    async () => {
      const result = await actions.approveRequest(11, { id: USER.head, tag: "head" });
      assert(result.ok, "approval succeeds");
      assert(appliedUpdate.filter.revision === 3, "update is guarded by the current revision");
      assert(
        appliedUpdate.update.$push.contributors.userId === USER.member,
        "the requester is credited as an improver",
      );
      assert(appliedUpdate.update.$inc.revision === 1, "revision is bumped");
      assert(appliedUpdate.update.$set.lastEditedById === USER.member, "requester recorded as editor");
    },
  );
}

async function testApproveStaleEditIsReleased() {
  const updates = [];
  await withStubs(
    [
      [
        DefinitionRequest,
        "findOneAndUpdate",
        () =>
          query({
            requestId: 12,
            type: "edit",
            definitionId: 7,
            baseRevision: 2,
            requesterId: USER.member,
            proposed: { term: "x", definition: "y" },
          }),
      ],
      [DefinitionRequest, "updateOne", async (filter, update) => updates.push(update)],
      [Definition, "findOne", () => query(physicsDef({ revision: 3 }))],
      [Definition, "findOneAndUpdate", () => { throw new Error("must not write a stale edit"); }],
    ],
    async () => {
      const result = await actions.approveRequest(12, { id: USER.head, tag: "head" });
      assert(!result.ok && result.message.includes("changed after"), "stale edits are refused");
      assert(updates[0].$set.status === "pending", "request goes back to pending");
    },
  );
}

async function testApproveEditOfDeletedDefinitionCloses() {
  let closed;
  await withStubs(
    [
      [
        DefinitionRequest,
        "findOneAndUpdate",
        (filter, update) => {
          if (filter.status === "pending") {
            return query({ requestId: 13, type: "edit", definitionId: 99, baseRevision: 1, requesterId: USER.member, proposed: {} });
          }
          closed = update.$set;
          return query({ requestId: 13, type: "edit", status: "rejected", ...update.$set });
        },
      ],
      [Definition, "findOne", () => query(null)],
    ],
    async () => {
      const result = await actions.approveRequest(13, { id: USER.head, tag: "head" });
      assert(result.ok && result.request.status === "rejected", "request is closed as rejected");
      assert(closed.rejectReason.includes("no longer exists"), "reason explains the definition is gone");
    },
  );
}

async function testApproveCreateDuplicateIsReleased() {
  const updates = [];
  await withStubs(
    [
      [
        DefinitionRequest,
        "findOneAndUpdate",
        () =>
          query({
            requestId: 14,
            type: "create",
            subjectId: "physics",
            boardId: "",
            requesterId: USER.member,
            requesterTag: "member",
            proposed: { term: "Heat", definition: "Energy transfer." },
          }),
      ],
      [DefinitionRequest, "updateOne", async (filter, update) => updates.push(update)],
      [Counter, "findOneAndUpdate", async () => ({ seq: 50 })],
      [
        Definition,
        "create",
        async () => {
          const err = new Error("E11000 duplicate key");
          err.code = 11000;
          throw err;
        },
      ],
    ],
    async () => {
      const result = await actions.approveRequest(14, { id: USER.head, tag: "head" });
      assert(!result.ok && result.message.includes("already uses that term"), "duplicate create is refused");
      assert(updates[0].$set.status === "pending", "request goes back to pending");
    },
  );
}

async function testAlreadyHandledRequest() {
  await withStubs(
    [[DefinitionRequest, "findOneAndUpdate", () => query(null)]],
    async () => {
      const approve = await actions.approveRequest(15, { id: USER.head, tag: "head" });
      const reject = await actions.rejectRequest(15, { id: USER.head, tag: "head" }, "no");
      assert(!approve.ok && !reject.ok, "a second reviewer can't handle the same request");
    },
  );
}

async function runEditModal({ userId, roles, definition, fields }) {
  const review = makeChannel(REVIEW_CHANNEL);
  const log = makeChannel(LOG_CHANNEL);
  const client = makeClient({ [REVIEW_CHANNEL]: review, [LOG_CHANNEL]: log });
  definitionsSystem(client);
  const handler = client.listeners[0].handler;

  const interaction = makeModalInteraction({
    client,
    customId: `definition:edit-modal:${definition.definitionId}:${definition.revision}`,
    userId,
    roles,
    fields: { note: "", chapter: "", topic: "", ...fields },
  });

  const writes = { edits: [], requests: [] };
  await withStubs(
    [
      [Definition, "findOne", (filter) => query(filter.definitionId ? definition : null)],
      [
        Definition,
        "findOneAndUpdate",
        (filter, update) => {
          writes.edits.push(update);
          return query({ ...definition, ...update.$set, revision: definition.revision + 1 });
        },
      ],
      [DefinitionRequest, "findOne", () => query(null)],
      [DefinitionRequest, "countDocuments", async () => 0],
      [
        DefinitionRequest,
        "create",
        async (doc) => {
          writes.requests.push(doc);
          return { ...doc, _id: "req", toObject: () => ({ ...doc }) };
        },
      ],
      [DefinitionRequest, "updateOne", async () => ({})],
      [Counter, "findOneAndUpdate", async () => ({ seq: 21 })],
    ],
    () => handler(interaction),
  );

  return { interaction, review, log, writes };
}

async function testHelperEditsOwnDefinitionDirectly() {
  const { interaction, review, log, writes } = await runEditModal({
    userId: USER.helper,
    roles: [ROLE.physicsHelper],
    definition: physicsDef(),
    fields: { term: "Specific heat capacity", definition: "Improved text.", chapter: "Thermal physics" },
  });
  assert(writes.edits.length === 1 && writes.requests.length === 0, "own definition is edited directly");
  assert(!writes.edits[0].$push, "the author is not added as an improver");
  assert(log.sent.length === 1 && review.sent.length === 0, "direct edit is logged, not reviewed");
  assert(interaction.replies[0].content.includes("updated"), "helper sees confirmation");
}

async function testHelperEditOfOthersGoesToReview() {
  const { interaction, review, writes } = await runEditModal({
    userId: USER.otherHelper,
    roles: [ROLE.physicsHelper],
    definition: physicsDef(),
    fields: { term: "Specific heat capacity", definition: "Their version.", chapter: "Thermal physics" },
  });
  assert(writes.edits.length === 0, "another helper's definition is not edited directly");
  assert(writes.requests[0].type === "edit", "an edit request is created");
  assert(writes.requests[0].baseRevision === 3, "request records the revision it was based on");
  assert(review.sent.length === 1, "request is posted for review");
  assert(
    review.sent[0].content === `<@&${ROLE.hlpHead}>` &&
      review.sent[0].allowedMentions.roles[0] === ROLE.hlpHead,
    "Helper Head is pinged",
  );
  assert(String(interaction.replies[0]).includes("request **#21**"), "requester gets the request number");
}

async function testUnchangedEditIsIgnored() {
  const def = physicsDef();
  const { interaction, writes, review } = await runEditModal({
    userId: USER.member,
    roles: [],
    definition: def,
    fields: { term: def.term, definition: def.definition, chapter: def.chapter },
  });
  assert(writes.requests.length === 0 && review.sent.length === 0, "no request for an unchanged form");
  assert(String(interaction.replies[0]).includes("Nothing changed"), "user is told nothing changed");
}

async function main() {
  const original = tryGetGuildConfig();
  setGuildConfig(testConfig());

  try {
    testNormalisationAndConfig();
    testPermissions();
    testRefsAndChoices();
    await testSearchRanking();
    testEmbeds();
    await testApproveEditCreditsRequester();
    await testApproveStaleEditIsReleased();
    await testApproveEditOfDeletedDefinitionCloses();
    await testApproveCreateDuplicateIsReleased();
    await testAlreadyHandledRequest();
    await testHelperEditsOwnDefinitionDirectly();
    await testHelperEditOfOthersGoesToReview();
    await testUnchangedEditIsIgnored();
  } finally {
    setGuildConfig(original);
  }

  console.log("verify-definitions: all checks passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
