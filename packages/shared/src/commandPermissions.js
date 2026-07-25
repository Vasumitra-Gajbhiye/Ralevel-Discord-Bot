const { DEFAULT_COMMAND_DISCORD_PERMISSIONS } = require("@ralevel/db");

const DISCORD_PERMISSION_OPTIONS = [
  { value: "", label: "Everyone" },
  { value: "BanMembers", label: "Ban Members" },
  { value: "ManageMessages", label: "Manage Messages" },
  { value: "ModerateMembers", label: "Moderate Members" },
  { value: "ManageRoles", label: "Manage Roles" },
  { value: "SendMessages", label: "Send Messages" },
  { value: "ChangeNickname", label: "Change Nickname" },
  { value: "ManageNicknames", label: "Manage Nicknames" },
  { value: "ManageChannels", label: "Manage Channels" },
  { value: "ManageGuild", label: "Manage Server" },
  { value: "PinMessages", label: "Pin Messages" },
];

/** Discord PermissionFlagsBits values used by this bot (string for REST API). */
const PERMISSION_BITFIELDS = {
  BanMembers: "4",
  ManageChannels: "16",
  ManageGuild: "32",
  SendMessages: "2048",
  ManageMessages: "8192",
  ChangeNickname: "67108864",
  ManageNicknames: "134217728",
  ManageRoles: "268435456",
  PinMessages: "1125899906842624",
  ModerateMembers: "1099511627776",
};

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

function buildCatalogEntries(catalogCommands, overrides = {}) {
  const normalizedOverrides = normalizeOverrides(overrides);

  return catalogCommands
    .map((command) => {
      const overrideValue = Object.prototype.hasOwnProperty.call(
        normalizedOverrides,
        command.name,
      )
        ? normalizedOverrides[command.name]
        : undefined;

      const effectivePermission =
        overrideValue !== undefined ? overrideValue || null : command.fileDefault;

      return {
        category: command.category,
        name: command.name,
        fileDefault: command.fileDefault,
        saved:
          overrideValue !== undefined ? overrideValue || null : undefined,
        effective: effectivePermission,
        payload: applyDiscordPermissionOverride(command.payload, overrideValue),
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
}) {
  if (!token) throw new Error("TOKEN is required to register guild commands");
  if (!clientId) {
    throw new Error("CLIENT_ID is required to register guild commands");
  }
  if (!guildId) {
    throw new Error("GUILD_ID is required to register guild commands");
  }

  const entries = buildCatalogEntries(catalogCommands, overrides);
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
