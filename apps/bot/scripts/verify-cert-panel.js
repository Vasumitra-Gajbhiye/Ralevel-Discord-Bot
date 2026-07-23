const {
  buildCertPanelPayload,
  getCertTypeIdFromCustomId,
  getCertTypeLabel,
  isCertPanelMessage,
  SEND_OPTIONS,
} = require("../utils/certPanel");
const { setGuildConfig } = require("../utils/guildConfigStore");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function mockConfig() {
  return {
    guildId: "guild-1",
    certificates: {
      types: [
        { id: "helper", label: "Helper", enabled: true, requiredRoleKeys: [] },
        {
          id: "resource",
          label: "Resource Contributor",
          enabled: true,
          requiredRoleKeys: [],
        },
      ],
      panel: {
        channelId: "123",
        panelMessageId: "old-message",
        title: "Certificate Application",
        description: "Apply below for <@&999>",
        color: "#2CDAF2",
        footer: "One pending application per certificate.",
        showTimestamp: true,
        buttons: [
          { certTypeId: "helper", label: "Apply — Helper", style: "Primary" },
          {
            certTypeId: "resource",
            label: "Apply — Resource",
            style: "Secondary",
          },
        ],
      },
    },
  };
}

function testCustomIdHelpers() {
  assert(
    getCertTypeIdFromCustomId("apply_helper") === "helper",
    "apply_helper should map to helper",
  );
  assert(
    getCertTypeIdFromCustomId("apply_resource") === "resource",
    "apply_resource should map to resource",
  );
  assert(
    getCertTypeIdFromCustomId("cert_approve:1") === null,
    "non-apply custom IDs should return null",
  );
}

function testBuildPayload() {
  const config = mockConfig();
  setGuildConfig(config);

  const payload = buildCertPanelPayload(config);
  assert(payload.embeds.length === 1, "payload should include one embed");
  assert(
    payload.embeds[0].data.title === "Certificate Application",
    "embed title should come from config",
  );
  assert(
    payload.embeds[0].data.description === "Apply below for <@&999>",
    "embed description should come from config",
  );
  assert(payload.components.length === 1, "two buttons should fit in one row");
  assert(
    payload.components[0].components[0].data.custom_id === "apply_helper",
    "button custom ID should use cert type id",
  );
  assert(
    payload.components[0].components[1].data.label === "Apply — Resource",
    "button label should come from config",
  );
  assert(
    payload.allowedMentions?.parse?.length === 0,
    "panel send options should disable mention parsing",
  );
  assert(
    SEND_OPTIONS.allowedMentions.parse.length === 0,
    "SEND_OPTIONS should disable mention parsing",
  );
}

function testTypeLabelResolution() {
  const config = mockConfig();
  setGuildConfig(config);
  assert(getCertTypeLabel("helper") === "Helper", "helper label should resolve");
  assert(
    getCertTypeLabel("resource") === "Resource Contributor",
    "resource label should resolve",
  );
}

function testPanelMessageDetection() {
  const config = mockConfig();
  setGuildConfig(config);

  const storedMatch = {
    id: "old-message",
    author: { id: "bot-1" },
    components: [],
  };
  assert(
    isCertPanelMessage(storedMatch, "bot-1"),
    "stored panel message id should be detected",
  );

  const buttonMatch = {
    id: "other-message",
    author: { id: "bot-1" },
    components: [
      {
        components: [{ customId: "apply_helper" }],
      },
    ],
  };
  assert(
    isCertPanelMessage(buttonMatch, "bot-1"),
    "messages with apply_* buttons should be detected",
  );

  const unrelated = {
    id: "other-message",
    author: { id: "bot-1" },
    components: [
      {
        components: [{ customId: "cert_approve:1" }],
      },
    ],
  };
  assert(
    !isCertPanelMessage(unrelated, "bot-1"),
    "non-panel bot messages should not be detected",
  );
}

function main() {
  testCustomIdHelpers();
  testBuildPayload();
  testTypeLabelResolution();
  testPanelMessageDetection();
  console.log("verify-cert-panel: all checks passed");
}

main();
