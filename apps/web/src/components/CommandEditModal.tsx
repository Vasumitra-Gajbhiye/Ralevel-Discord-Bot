"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DESCRIPTION_MAX,
  type EditableMetadata,
  type EditableMetadataNode,
} from "@ralevel/shared/commandMetadataOverrides";
import { validateDisplayName } from "@ralevel/shared/commandDisplayNames";

type CatalogCommandForEdit = {
  name: string;
  effectiveName: string;
  editableMetadata: EditableMetadata;
};

type CommandEditModalProps = {
  open: boolean;
  command: CatalogCommandForEdit | null;
  saving?: boolean;
  onCancel: () => void;
  onSave: (payload: {
    displayName: string;
    editableMetadata: EditableMetadata;
  }) => void | Promise<void>;
};

function cloneEditableMetadata(metadata: EditableMetadata): EditableMetadata {
  return JSON.parse(JSON.stringify(metadata)) as EditableMetadata;
}

function updateNodeAtPath(
  nodes: EditableMetadataNode[],
  path: number[],
  updater: (node: EditableMetadataNode) => EditableMetadataNode,
): EditableMetadataNode[] {
  if (path.length === 0) return nodes;

  const [index, ...rest] = path;
  return nodes.map((node, nodeIndex) => {
    if (nodeIndex !== index) return node;
    if (rest.length === 0) {
      return updater(node);
    }
    return {
      ...node,
      children: updateNodeAtPath(node.children ?? [], rest, updater),
    };
  });
}

function MetadataNodeFields({
  node,
  path,
  pathLabel,
  onUpdate,
}: {
  node: EditableMetadataNode;
  path: number[];
  pathLabel: string;
  onUpdate: (
    path: number[],
    updater: (node: EditableMetadataNode) => EditableMetadataNode,
  ) => void;
}) {
  const isSubcommand =
    node.kind === "subcommand" || node.kind === "subcommand_group";

  return (
    <div
      className="stack"
      style={{
        gap: "0.75rem",
        marginLeft: path.length > 0 ? "1rem" : 0,
        paddingLeft: path.length > 0 ? "0.75rem" : 0,
        borderLeft: path.length > 0 ? "1px solid var(--border)" : undefined,
      }}
    >
      <div className="field">
        <div className="row" style={{ justifyContent: "space-between", gap: "0.5rem" }}>
          <label htmlFor={`${pathLabel}-description`}>
            {isSubcommand ? "Subcommand" : "Option"}:{" "}
            <span className="mono">{node.name}</span>
          </label>
          {node.description !== node.defaultDescription ? (
            <button
              type="button"
              className="btn btn-sm"
              onClick={() =>
                onUpdate(path, (current) => ({
                  ...current,
                  description: current.defaultDescription,
                }))
              }
            >
              Reset
            </button>
          ) : null}
        </div>
        <textarea
          id={`${pathLabel}-description`}
          className="input"
          rows={2}
          maxLength={DESCRIPTION_MAX}
          value={node.description}
          onChange={(event) =>
            onUpdate(path, (current) => ({
              ...current,
              description: event.target.value,
            }))
          }
        />
        <span className="muted" style={{ fontSize: "0.8rem" }}>
          {node.description.length}/{DESCRIPTION_MAX}
        </span>
      </div>

      {(node.choices ?? []).map((choice, choiceIndex) => (
        <div className="field" key={choice.value}>
          <div
            className="row"
            style={{ justifyContent: "space-between", gap: "0.5rem" }}
          >
            <label htmlFor={`${pathLabel}-choice-${choice.value}`}>
              Choice: <span className="mono">{choice.value}</span>
            </label>
            {choice.name !== choice.defaultName ? (
              <button
                type="button"
                className="btn btn-sm"
                onClick={() =>
                  onUpdate(path, (current) => ({
                    ...current,
                    choices: (current.choices ?? []).map((item, index) =>
                      index === choiceIndex
                        ? { ...item, name: item.defaultName }
                        : item,
                    ),
                  }))
                }
              >
                Reset
              </button>
            ) : null}
          </div>
          <input
            id={`${pathLabel}-choice-${choice.value}`}
            className="input"
            maxLength={DESCRIPTION_MAX}
            value={choice.name}
            onChange={(event) =>
              onUpdate(path, (current) => ({
                ...current,
                choices: (current.choices ?? []).map((item, index) =>
                  index === choiceIndex
                    ? { ...item, name: event.target.value }
                    : item,
                ),
              }))
            }
          />
        </div>
      ))}

      {(node.children ?? []).map((child, childIndex) => (
        <MetadataNodeFields
          key={child.name}
          node={child}
          path={[...path, childIndex]}
          pathLabel={`${pathLabel}-${child.name}`}
          onUpdate={onUpdate}
        />
      ))}
    </div>
  );
}

export function CommandEditModal({
  open,
  command,
  saving = false,
  onCancel,
  onSave,
}: CommandEditModalProps) {
  const [displayName, setDisplayName] = useState("");
  const [metadata, setMetadata] = useState<EditableMetadata | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !command) return;
    setDisplayName(command.effectiveName);
    setMetadata(cloneEditableMetadata(command.editableMetadata));
    setError(null);
  }, [open, command]);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !saving) onCancel();
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onCancel, saving]);

  const displayNameError = useMemo(() => {
    if (!command) return null;
    const value = displayName.trim();
    if (!value) return "Command name is required";
    if (value !== command.name) {
      return validateDisplayName(value);
    }
    return null;
  }, [command, displayName]);

  function updateMetadataNode(
    path: number[],
    updater: (node: EditableMetadataNode) => EditableMetadataNode,
  ) {
    setMetadata((current) => {
      if (!current) return current;
      return {
        ...current,
        children: updateNodeAtPath(current.children, path, updater),
      };
    });
    setError(null);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!command || !metadata) return;

    if (displayNameError) {
      setError(displayNameError);
      return;
    }

    if (!metadata.description.trim()) {
      setError("Command description is required.");
      return;
    }

    if (metadata.description.length > DESCRIPTION_MAX) {
      setError(`Command description must be ${DESCRIPTION_MAX} characters or fewer.`);
      return;
    }

    await onSave({
      displayName: displayName.trim(),
      editableMetadata: metadata,
    });
  }

  if (!open || !command || !metadata) return null;

  return (
    <div className="modal-backdrop" role="presentation" onClick={saving ? undefined : onCancel}>
      <div
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="command-edit-modal-title"
        onClick={(event) => event.stopPropagation()}
        style={{ maxWidth: "42rem", width: "min(42rem, 100%)" }}
      >
        <h3 id="command-edit-modal-title">Edit /{command.name}</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          Customize the slash command text shown in Discord. Names and option
          keys stay fixed so the bot handler keeps working.
        </p>

        <form className="modal-form" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="command-edit-display-name">Display name</label>
            <input
              id="command-edit-display-name"
              className="input mono"
              value={displayName}
              onChange={(event) => {
                setDisplayName(event.target.value);
                setError(null);
              }}
            />
            <span className="muted" style={{ fontSize: "0.8rem" }}>
              default: /{command.name}
            </span>
          </div>

          <div className="field">
            <div
              className="row"
              style={{ justifyContent: "space-between", gap: "0.5rem" }}
            >
              <label htmlFor="command-edit-description">Description</label>
              {metadata.description !== metadata.defaultDescription ? (
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() =>
                    setMetadata((current) =>
                      current
                        ? {
                            ...current,
                            description: current.defaultDescription,
                          }
                        : current,
                    )
                  }
                >
                  Reset
                </button>
              ) : null}
            </div>
            <textarea
              id="command-edit-description"
              className="input"
              rows={3}
              maxLength={DESCRIPTION_MAX}
              value={metadata.description}
              onChange={(event) => {
                setMetadata((current) =>
                  current
                    ? { ...current, description: event.target.value }
                    : current,
                );
                setError(null);
              }}
            />
            <span className="muted" style={{ fontSize: "0.8rem" }}>
              {metadata.description.length}/{DESCRIPTION_MAX}
            </span>
          </div>

          {metadata.children.length > 0 ? (
            <div className="stack" style={{ gap: "1rem" }}>
              <strong>Options</strong>
              {metadata.children.map((child, childIndex) => (
                <MetadataNodeFields
                  key={child.name}
                  node={child}
                  path={[childIndex]}
                  pathLabel={`${command.name}-${child.name}`}
                  onUpdate={updateMetadataNode}
                />
              ))}
            </div>
          ) : null}

          {error ? <p className="modal-error">{error}</p> : null}

          <div className="modal-actions">
            <button
              type="button"
              className="btn"
              onClick={onCancel}
              disabled={saving}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
