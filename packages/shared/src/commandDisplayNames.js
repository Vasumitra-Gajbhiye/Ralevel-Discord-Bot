const DISPLAY_NAME_PATTERN = /^[a-z0-9_-]{1,32}$/;

function normalizeNameOverrides(overrides = {}) {
  if (overrides instanceof Map) {
    return Object.fromEntries(overrides);
  }
  return { ...overrides };
}

function validateDisplayName(name) {
  if (typeof name !== "string" || !name.trim()) {
    return "Command name is required";
  }

  if (name.length > 32) {
    return "Command name must be 32 characters or fewer";
  }

  if (!DISPLAY_NAME_PATTERN.test(name)) {
    return "Use lowercase letters, numbers, hyphens, and underscores only";
  }

  return null;
}

function getEffectiveCommandName(canonical, overrides = {}) {
  const normalized = normalizeNameOverrides(overrides);
  const override = normalized[canonical];
  if (!override || override === canonical) return canonical;
  return override;
}

function applyCommandNameOverride(payload, displayName) {
  if (!displayName || displayName === payload.name) {
    return payload;
  }

  return {
    ...payload,
    name: displayName,
  };
}

function buildDeployedToCanonicalMap(catalogCommands, overrides = {}) {
  const normalized = normalizeNameOverrides(overrides);
  const reverse = new Map();

  for (const command of catalogCommands) {
    const canonical = command.name;
    const deployed = getEffectiveCommandName(canonical, normalized);
    reverse.set(deployed, canonical);
  }

  return reverse;
}

function buildDeployedToCanonicalObject(catalogCommands, overrides = {}) {
  return Object.fromEntries(
    buildDeployedToCanonicalMap(catalogCommands, overrides),
  );
}

function normalizeCommandDisplayNamesForSave(
  catalogCommands,
  overrides = {},
) {
  const normalized = normalizeNameOverrides(overrides);
  const catalogNames = new Set(catalogCommands.map((command) => command.name));
  const next = {};

  for (const [canonical, displayName] of Object.entries(normalized)) {
    if (!catalogNames.has(canonical)) continue;
    if (!displayName || displayName === canonical) continue;
    next[canonical] = displayName;
  }

  return next;
}

function validateCommandDisplayNames(catalogCommands, overrides = {}) {
  const normalized = normalizeNameOverrides(overrides);
  const catalogNames = catalogCommands.map((command) => command.name);
  const catalogSet = new Set(catalogNames);
  const effectiveNames = new Map();
  const errors = [];

  for (const canonical of catalogNames) {
    const raw = normalized[canonical];
    if (raw === undefined || raw === null || raw === "") continue;

    if (typeof raw !== "string") {
      errors.push(`${canonical}: invalid display name`);
      continue;
    }

    const trimmed = raw.trim();
    if (!trimmed || trimmed === canonical) continue;

    const formatError = validateDisplayName(trimmed);
    if (formatError) {
      errors.push(`${canonical}: ${formatError}`);
      continue;
    }

    if (catalogSet.has(trimmed) && trimmed !== canonical) {
      errors.push(
        `${canonical}: "${trimmed}" conflicts with another command's default name`,
      );
      continue;
    }

    if (effectiveNames.has(trimmed)) {
      errors.push(
        `${canonical}: "${trimmed}" is already used by ${effectiveNames.get(trimmed)}`,
      );
      continue;
    }

    effectiveNames.set(trimmed, canonical);
  }

  for (const key of Object.keys(normalized)) {
    if (!catalogSet.has(key)) {
      errors.push(`${key}: unknown command`);
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    displayNames: normalizeCommandDisplayNamesForSave(
      catalogCommands,
      normalized,
    ),
  };
}

function resolveCanonicalCommandName(
  deployedName,
  catalogCommands,
  overrides = {},
) {
  const reverse = buildDeployedToCanonicalMap(catalogCommands, overrides);
  return reverse.get(deployedName) || deployedName;
}

module.exports = {
  DISPLAY_NAME_PATTERN,
  normalizeNameOverrides,
  validateDisplayName,
  getEffectiveCommandName,
  applyCommandNameOverride,
  buildDeployedToCanonicalMap,
  buildDeployedToCanonicalObject,
  normalizeCommandDisplayNamesForSave,
  validateCommandDisplayNames,
  resolveCanonicalCommandName,
};
