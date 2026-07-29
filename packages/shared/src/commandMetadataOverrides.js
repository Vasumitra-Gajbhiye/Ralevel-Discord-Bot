const DESCRIPTION_MIN = 1;
const DESCRIPTION_MAX = 100;
const CHOICE_NAME_MAX = 100;

const SUBCOMMAND_TYPE = 1;
const SUBCOMMAND_GROUP_TYPE = 2;

function normalizeMetadataOverrides(overrides = {}) {
  if (overrides instanceof Map) {
    return Object.fromEntries(overrides);
  }
  return { ...overrides };
}

function validateDescription(text, label) {
  if (typeof text !== "string") {
    return `${label} must be a string`;
  }
  const trimmed = text.trim();
  if (trimmed.length < DESCRIPTION_MIN) {
    return `${label} is required`;
  }
  if (trimmed.length > DESCRIPTION_MAX) {
    return `${label} must be ${DESCRIPTION_MAX} characters or fewer`;
  }
  return null;
}

function validateChoiceName(text, label) {
  if (typeof text !== "string") {
    return `${label} must be a string`;
  }
  const trimmed = text.trim();
  if (trimmed.length < DESCRIPTION_MIN) {
    return `${label} is required`;
  }
  if (trimmed.length > CHOICE_NAME_MAX) {
    return `${label} must be ${CHOICE_NAME_MAX} characters or fewer`;
  }
  return null;
}

function isSubcommandOption(option) {
  return option?.type === SUBCOMMAND_TYPE || option?.type === SUBCOMMAND_GROUP_TYPE;
}

function mergeOptionOverrides(baseOptions = [], overrideOptions = []) {
  if (!Array.isArray(baseOptions) || baseOptions.length === 0) {
    return baseOptions;
  }

  const overrideByName = new Map(
    (overrideOptions || []).map((option) => [option.name, option]),
  );

  return baseOptions.map((baseOption) => {
    const override = overrideByName.get(baseOption.name);
    if (!override) return baseOption;

    const next = { ...baseOption };

    if (override.description !== undefined) {
      next.description = override.description;
    }

    if (Array.isArray(baseOption.choices) && Array.isArray(override.choices)) {
      const choiceOverrides = new Map(
        override.choices.map((choice) => [String(choice.value), choice]),
      );
      next.choices = baseOption.choices.map((choice) => {
        const choiceOverride = choiceOverrides.get(String(choice.value));
        if (!choiceOverride?.name) return choice;
        return { ...choice, name: choiceOverride.name };
      });
    }

    if (Array.isArray(baseOption.options) && Array.isArray(override.options)) {
      next.options = mergeOptionOverrides(baseOption.options, override.options);
    }

    return next;
  });
}

function applyMetadataOverride(basePayload, override) {
  if (!override || typeof override !== "object") {
    return basePayload;
  }

  const next = { ...basePayload };

  if (override.description !== undefined) {
    next.description = override.description;
  }

  if (Array.isArray(basePayload.options) && Array.isArray(override.options)) {
    next.options = mergeOptionOverrides(basePayload.options, override.options);
  }

  return next;
}

function extractOptionMetadata(option) {
  if (isSubcommandOption(option)) {
    const children = Array.isArray(option.options)
      ? option.options.map(extractOptionMetadata)
      : [];

    return {
      kind: option.type === SUBCOMMAND_GROUP_TYPE ? "subcommand_group" : "subcommand",
      name: option.name,
      defaultDescription: option.description ?? "",
      description: option.description ?? "",
      children,
    };
  }

  const choices = Array.isArray(option.choices)
    ? option.choices.map((choice) => ({
        value: String(choice.value),
        defaultName: choice.name ?? "",
        name: choice.name ?? "",
      }))
    : [];

  return {
    kind: "option",
    name: option.name,
    defaultDescription: option.description ?? "",
    description: option.description ?? "",
    choices,
  };
}

function applyEditableMetadataToPayload(basePayload, editable) {
  const override = {
    description: editable.description,
    options: [],
  };

  for (const child of editable.children ?? []) {
    const childOverride = buildOverrideFromEditableNode(child);
    if (childOverride) {
      override.options.push(childOverride);
    }
  }

  if (override.options.length === 0) {
    delete override.options;
  }

  return applyMetadataOverride(basePayload, override);
}

function buildOverrideFromEditableNode(node) {
  const result = { name: node.name };
  let hasOverride = false;

  if (node.description !== node.defaultDescription) {
    result.description = node.description;
    hasOverride = true;
  }

  if (node.kind === "subcommand" || node.kind === "subcommand_group") {
    const childOverrides = [];
    for (const child of node.children ?? []) {
      const childOverride = buildOverrideFromEditableNode(child);
      if (childOverride) {
        childOverrides.push(childOverride);
      }
    }
    if (childOverrides.length > 0) {
      result.options = childOverrides;
      hasOverride = true;
    }
  }

  if (node.kind === "option" && Array.isArray(node.choices) && node.choices.length > 0) {
    const choiceOverrides = [];
    for (const choice of node.choices) {
      if (choice.name !== choice.defaultName) {
        choiceOverrides.push({ value: choice.value, name: choice.name });
      }
    }
    if (choiceOverrides.length > 0) {
      result.choices = choiceOverrides;
      hasOverride = true;
    }
  }

  return hasOverride ? result : null;
}

function extractEditableMetadata(payload, effectivePayload = payload) {
  const baseChildren = Array.isArray(payload.options)
    ? payload.options.map(extractOptionMetadata)
    : [];
  const effectiveChildren = Array.isArray(effectivePayload.options)
    ? effectivePayload.options.map(extractOptionMetadata)
    : [];

  function mergeChildren(base, effective) {
    return base.map((baseChild, index) => {
      const effectiveChild = effective[index];
      if (!effectiveChild || baseChild.name !== effectiveChild.name) {
        return baseChild;
      }

      const merged = {
        ...baseChild,
        description: effectiveChild.description,
      };

      if (baseChild.choices?.length) {
        merged.choices = baseChild.choices.map((choice, choiceIndex) => ({
          ...choice,
          name: effectiveChild.choices?.[choiceIndex]?.name ?? choice.name,
        }));
      }

      if (baseChild.children?.length) {
        merged.children = mergeChildren(
          baseChild.children,
          effectiveChild.children ?? [],
        );
      }

      return merged;
    });
  }

  return {
    description: effectivePayload.description ?? "",
    defaultDescription: payload.description ?? "",
    children: mergeChildren(baseChildren, effectiveChildren),
  };
}

function buildMetadataOverrideFromEditable(catalogPayload, editable) {
  const override = { options: [] };
  let hasOverride = false;

  if (editable.description !== editable.defaultDescription) {
    override.description = editable.description;
    hasOverride = true;
  }

  for (const child of editable.children ?? []) {
    const childOverride = buildOverrideFromEditableNode(child);
    if (childOverride) {
      override.options.push(childOverride);
      hasOverride = true;
    }
  }

  if (override.options.length === 0) {
    delete override.options;
  }

  if (!hasOverride) {
    return null;
  }

  return override;
}

function validateEditableMetadata(editable, commandName) {
  const errors = [];

  const descriptionError = validateDescription(
    editable.description,
    `/${commandName} description`,
  );
  if (descriptionError) errors.push(descriptionError);

  function validateNode(node, path) {
    const nodeLabel = `${path} description`;
    const nodeError = validateDescription(node.description, nodeLabel);
    if (nodeError) errors.push(nodeError);

    for (const choice of node.choices ?? []) {
      const choiceError = validateChoiceName(
        choice.name,
        `${path} choice "${choice.value}"`,
      );
      if (choiceError) errors.push(choiceError);
    }

    for (const child of node.children ?? []) {
      validateNode(child, `${path} → ${child.name}`);
    }
  }

  for (const child of editable.children ?? []) {
    validateNode(child, `/${commandName} → ${child.name}`);
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true };
}

function findCatalogCommand(catalogCommands, commandName) {
  return catalogCommands.find((command) => command.name === commandName) ?? null;
}

function validateSingleMetadataOverride(catalogCommand, override, commandName) {
  if (!override || typeof override !== "object") {
    return { ok: true, override: null };
  }

  if (!catalogCommand) {
    return { ok: false, errors: [`Unknown command: ${commandName}`] };
  }

  const editable = extractEditableMetadata(catalogCommand.payload);
  if (override.description !== undefined) {
    editable.description = override.description;
  }

  function applyOverrideToNode(node, overrideNode) {
    if (!overrideNode) return;
    if (overrideNode.description !== undefined) {
      node.description = overrideNode.description;
    }

    if (overrideNode.choices?.length) {
      const choiceMap = new Map(
        overrideNode.choices.map((choice) => [String(choice.value), choice]),
      );
      for (const choice of node.choices ?? []) {
        const choiceOverride = choiceMap.get(choice.value);
        if (choiceOverride?.name !== undefined) {
          choice.name = choiceOverride.name;
        }
      }
    }

    if (overrideNode.options?.length) {
      const childMap = new Map(
        overrideNode.options.map((child) => [child.name, child]),
      );
      for (const child of node.children ?? []) {
        applyOverrideToNode(child, childMap.get(child.name));
      }
    }
  }

  const overrideChildren = new Map(
    (override.options ?? []).map((option) => [option.name, option]),
  );
  for (const child of editable.children) {
    applyOverrideToNode(child, overrideChildren.get(child.name));
  }

  const validation = validateEditableMetadata(editable, commandName);
  if (!validation.ok) {
    return validation;
  }

  const normalized = buildMetadataOverrideFromEditable(
    catalogCommand.payload,
    editable,
  );

  return { ok: true, override: normalized };
}

function validateCommandMetadataOverrides(catalogCommands, overrides = {}) {
  const normalized = normalizeMetadataOverrides(overrides);
  const catalogNames = new Set(catalogCommands.map((command) => command.name));
  const next = {};
  const errors = [];

  for (const [commandName, override] of Object.entries(normalized)) {
    if (!catalogNames.has(commandName)) continue;

    const catalogCommand = findCatalogCommand(catalogCommands, commandName);
    const result = validateSingleMetadataOverride(
      catalogCommand,
      override,
      commandName,
    );

    if (!result.ok) {
      errors.push(...(result.errors ?? []));
      continue;
    }

    if (result.override) {
      next[commandName] = result.override;
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, overrides: next };
}

function normalizeCommandMetadataOverridesForSave(
  catalogCommands,
  overrides = {},
) {
  const result = validateCommandMetadataOverrides(catalogCommands, overrides);
  if (!result.ok) {
    return result;
  }
  return { ok: true, overrides: result.overrides };
}

module.exports = {
  DESCRIPTION_MAX,
  normalizeMetadataOverrides,
  applyMetadataOverride,
  extractEditableMetadata,
  buildMetadataOverrideFromEditable,
  validateEditableMetadata,
  validateCommandMetadataOverrides,
  normalizeCommandMetadataOverridesForSave,
  applyEditableMetadataToPayload,
};
