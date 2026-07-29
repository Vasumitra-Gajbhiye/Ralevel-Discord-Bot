const { DEFAULT_COMMAND_DISCORD_PERMISSIONS } = require("@ralevel/db");
const { bitfields: GENERATED_PERMISSION_BITFIELDS } = require("./generated/permissionBitfields.json");
const { commands: CATALOG_COMMANDS } = require("./generated/commandCatalog.json");
const {
  getEffectiveCommandName,
  applyCommandNameOverride,
  normalizeNameOverrides,
} = require("./commandDisplayNames");
const {
  applyMetadataOverride,
  normalizeMetadataOverrides,
} = require("./commandMetadataOverrides");

const PERMISSION_LABELS = {
  Administrator: "Administrator",
  BanMembers: "Ban Members",
  ManageMessages: "Manage Messages",
  ModerateMembers: "Moderate Members",
  ManageRoles: "Manage Roles",
  SendMessages: "Send Messages",
  ChangeNickname: "Change Nickname",
  ManageNicknames: "Manage Nicknames",
  ManageChannels: "Manage Channels",
  ManageGuild: "Manage Server",
  PinMessages: "Pin Messages",
};

const CURATED_PERMISSION_ORDER = [
  "",
  "Administrator",
  "BanMembers",
  "ManageMessages",
  "ModerateMembers",
  "ManageRoles",
  "SendMessages",
  "ChangeNickname",
  "ManageNicknames",
  "ManageChannels",
  "ManageGuild",
  "PinMessages",
];

function buildPermissionOptions() {
  const usedInCatalog = new Set(
    CATALOG_COMMANDS.map((command) => command.fileDefault).filter(Boolean),
  );
  const optionValues = new Set([
    ...CURATED_PERMISSION_ORDER,
    ...usedInCatalog,
  ]);

  return [...optionValues].map((value) => ({
    value,
    label: value ? PERMISSION_LABELS[value] || value : "Everyone",
  }));
}

const DISCORD_PERMISSION_OPTIONS = buildPermissionOptions();

/** Discord PermissionFlagsBits values (string for REST API). */
const PERMISSION_BITFIELDS = GENERATED_PERMISSION_BITFIELDS;

const BITFIELD_TO_NAME = Object.fromEntries(
  Object.entries(PERMISSION_BITFIELDS).map(([name, bit]) => [bit, name]),
);

function permissionNameFromBitfield(bitfield) {
  if (bitfield == null || bitfield === "") return null;
  return BITFIELD_TO_NAME[String(bitfield)] || null;
}

function permissionBitfieldFromName(name) {
  if (!name) return null;
  return PERMISSION_BITFIELDS[name] ?? null;
}

function normalizeOverrides(overrides = {}) {
  if (overrides instanceof Map) {
    return Object.fromEntries(overrides);
  }
  return { ...overrides };
}

function applyDiscordPermissionOverride(payload, overrideValue) {
  if (overrideValue === undefined) {
    return payload;
  }

  const next = { ...payload };

  if (!overrideValue) {
    delete next.default_member_permissions;
    return next;
  }

  const bitfield = permissionBitfieldFromName(overrideValue);
  if (!bitfield) {
    throw new Error(`Unknown Discord permission flag: ${overrideValue}`);
  }

  next.default_member_permissions = bitfield;
  return next;
}

function buildCatalogEntries(
  catalogCommands,
  permissionOverrides = {},
  nameOverrides = {},
  metadataOverrides = {},
) {
  const normalizedPermissionOverrides = normalizeOverrides(permissionOverrides);
  const normalizedNameOverrides = normalizeNameOverrides(nameOverrides);
  const normalizedMetadataOverrides = normalizeMetadataOverrides(metadataOverrides);

  return catalogCommands
    .map((command) => {
      const overrideValue = Object.prototype.hasOwnProperty.call(
        normalizedPermissionOverrides,
        command.name,
      )
        ? normalizedPermissionOverrides[command.name]
        : undefined;

      const effectivePermission =
        overrideValue !== undefined ? overrideValue || null : command.fileDefault;

      const displayName = normalizedNameOverrides[command.name];
      const effectiveName = getEffectiveCommandName(
        command.name,
        normalizedNameOverrides,
      );

      let payload = applyDiscordPermissionOverride(
        command.payload,
        overrideValue,
      );
      payload = applyCommandNameOverride(payload, effectiveName);
      payload = applyMetadataOverride(
        payload,
        normalizedMetadataOverrides[command.name],
      );

      return {
        category: command.category,
        name: command.name,
        displayName:
          displayName && displayName !== command.name ? displayName : null,
        effectiveName,
        fileDefault: command.fileDefault,
        saved:
          overrideValue !== undefined ? overrideValue || null : undefined,
        effective: effectivePermission,
        payload,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function registerGuildCommandsFromCatalog({
  token,
  clientId,
  guildId,
  catalogCommands,
  overrides = {},
  nameOverrides = {},
  metadataOverrides = {},
}) {
  if (!token) throw new Error("TOKEN is required to register guild commands");
  if (!clientId) {
    throw new Error("CLIENT_ID is required to register guild commands");
  }
  if (!guildId) {
    throw new Error("GUILD_ID is required to register guild commands");
  }

  const entries = buildCatalogEntries(
    catalogCommands,
    overrides,
    nameOverrides,
    metadataOverrides,
  );
  const body = entries.map((entry) => entry.payload);

  const response = await fetch(
    `https://discord.com/api/v10/applications/${clientId}/guilds/${guildId}/commands`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bot ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Discord command sync failed (${response.status}): ${text || response.statusText}`,
    );
  }

  const data = await response.json();

  return {
    commandCount: Array.isArray(data) ? data.length : body.length,
    commands: entries,
  };
}

module.exports = {
  DISCORD_PERMISSION_OPTIONS,
  DEFAULT_COMMAND_DISCORD_PERMISSIONS,
  PERMISSION_BITFIELDS,
  permissionNameFromBitfield,
  permissionBitfieldFromName,
  normalizeOverrides,
  applyDiscordPermissionOverride,
  buildCatalogEntries,
  registerGuildCommandsFromCatalog,
};
