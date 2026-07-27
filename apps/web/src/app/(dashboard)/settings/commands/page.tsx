"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  normalizeCommandDisplayNamesForSave,
  validateCommandDisplayNames,
  validateDisplayName,
} from "@ralevel/shared/commandDisplayNames";
import { PageHeader, RestartBanner } from "@/components/PageHeader";
import { RolePicker } from "@/components/RolePicker";
import { SaveActions } from "@/components/SaveActions";
import { useGuildConfig } from "@/lib/useGuildConfig";
import { isDraftDirty, useUnsavedChanges } from "@/lib/unsaved-changes";

const BAN_APPEAL_COMMANDS = new Set([
  "ban-appeal-approved",
  "ban-appeal-rejected",
]);

type CatalogCommand = {
  name: string;
  displayName: string | null;
  effectiveName: string;
};

function buildPermissionsToSave(
  catalogNames: string[],
  current: Record<string, string[]>,
  saved: Record<string, string[]>,
) {
  const catalogSet = new Set(catalogNames);
  const merged = { ...saved };

  for (const cmd of catalogNames) {
    merged[cmd] = current[cmd] ?? saved[cmd] ?? [];
  }

  for (const key of Object.keys(merged)) {
    if (!catalogSet.has(key) && !BAN_APPEAL_COMMANDS.has(key)) {
      delete merged[key];
    }
  }

  return merged;
}

function buildNameDraft(commands: CatalogCommand[]) {
  const draft: Record<string, string> = {};
  for (const command of commands) {
    draft[command.name] = command.effectiveName;
  }
  return draft;
}

function buildDisplayNamesToSave(
  commands: CatalogCommand[],
  draft: Record<string, string>,
) {
  const raw: Record<string, string> = {};
  for (const command of commands) {
    const value = draft[command.name]?.trim() ?? "";
    if (value && value !== command.name) {
      raw[command.name] = value;
    }
  }
  return normalizeCommandDisplayNamesForSave(commands, raw);
}

export default function CommandsPage() {
  const { config, loading, error, saving, status, save } = useGuildConfig();
  const [draft, setDraft] = useState<Record<string, string[]> | null>(null);
  const [catalog, setCatalog] = useState<CatalogCommand[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [editingNames, setEditingNames] = useState(false);
  const [nameDraft, setNameDraft] = useState<Record<string, string> | null>(
    null,
  );
  const [pendingNameSync, setPendingNameSync] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const savedPermissions = useMemo(
    () => config?.commandPermissions ?? {},
    [config?.commandPermissions],
  );

  const savedDisplayNames = useMemo(
    () => config?.commandDisplayNames ?? {},
    [config?.commandDisplayNames],
  );

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true);
    setCatalogError(null);
    try {
      const res = await fetch("/api/commands/catalog");
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { commands: CatalogCommand[] };
      setCatalog(data.commands);
    } catch (e) {
      setCatalogError(e instanceof Error ? e.message : "Failed to load catalog");
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  const editableCommands = useMemo(() => {
    return catalog.filter((cmd) => !BAN_APPEAL_COMMANDS.has(cmd.name));
  }, [catalog]);

  const commandNames = useMemo(() => {
    return editableCommands.map((cmd) => cmd.name).sort();
  }, [editableCommands]);

  const permissions = useMemo(() => {
    const base = draft ?? savedPermissions;
    const merged = { ...base };
    for (const cmd of commandNames) {
      if (!(cmd in merged)) {
        merged[cmd] = savedPermissions[cmd] ?? [];
      }
    }
    return merged;
  }, [draft, savedPermissions, commandNames]);

  const normalizedSaved = useMemo(() => {
    const merged = { ...savedPermissions };
    for (const cmd of commandNames) {
      if (!(cmd in merged)) {
        merged[cmd] = [];
      }
    }
    return merged;
  }, [savedPermissions, commandNames]);

  const isPermissionsDirty = useMemo(
    () => isDraftDirty(draft, normalizedSaved),
    [draft, normalizedSaved],
  );

  const normalizedSavedDisplayNames = useMemo(() => {
    return { ...savedDisplayNames };
  }, [savedDisplayNames]);

  const currentNameDraft = useMemo(() => {
    if (nameDraft) return nameDraft;
    return buildNameDraft(editableCommands);
  }, [nameDraft, editableCommands]);

  const isNamesDirty = useMemo(() => {
    if (!editingNames) return false;
    const next = buildDisplayNamesToSave(editableCommands, currentNameDraft);
    return JSON.stringify(next) !== JSON.stringify(normalizedSavedDisplayNames);
  }, [
    editingNames,
    editableCommands,
    currentNameDraft,
    normalizedSavedDisplayNames,
  ]);

  const nameValidation = useMemo(() => {
    if (!editingNames) {
      return {
        ok: true as const,
        displayNames: {} as Record<string, string>,
      };
    }

    const raw: Record<string, string> = {};
    for (const command of editableCommands) {
      const value = currentNameDraft[command.name]?.trim() ?? "";
      if (value && value !== command.name) {
        raw[command.name] = value;
      }
    }
    return validateCommandDisplayNames(editableCommands, raw);
  }, [editingNames, editableCommands, currentNameDraft]);

  const rowNameErrors = useMemo(() => {
    const errors: Record<string, string> = {};
    if (!editingNames) return errors;

    const used = new Map<string, string>();
    for (const command of editableCommands) {
      const value = currentNameDraft[command.name]?.trim() ?? "";
      if (!value || value === command.name) continue;

      const formatError = validateDisplayName(value);
      if (formatError) {
        errors[command.name] = formatError;
        continue;
      }

      if (
        editableCommands.some(
          (other) => other.name === value && other.name !== command.name,
        )
      ) {
        errors[command.name] = `Conflicts with another command's default name`;
        continue;
      }

      if (used.has(value)) {
        errors[command.name] = `Already used by /${used.get(value)}`;
        continue;
      }

      used.set(value, command.name);
    }

    return errors;
  }, [editingNames, editableCommands, currentNameDraft]);

  const roles = config?.roles ?? [];

  function setCommandRoles(command: string, keys: string[]) {
    setDraft({ ...permissions, [command]: keys });
  }

  function startEditingNames() {
    setNameDraft(buildNameDraft(editableCommands));
    setEditingNames(true);
  }

  function cancelEditingNames() {
    setNameDraft(null);
    setEditingNames(false);
  }

  function setCommandDisplayName(canonical: string, value: string) {
    setNameDraft({ ...currentNameDraft, [canonical]: value });
  }

  async function onSavePermissions() {
    const nextPermissions = buildPermissionsToSave(
      commandNames,
      permissions,
      savedPermissions,
    );
    await save({ commandPermissions: nextPermissions });
    setDraft(null);
  }

  async function onSaveNames() {
    if (!nameValidation.ok) return;

    await save({ commandDisplayNames: nameValidation.displayNames });
    setNameDraft(null);
    setEditingNames(false);
    setPendingNameSync(true);
    await loadCatalog();
  }

  async function onSync() {
    setSyncing(true);
    setSyncStatus(null);
    setSyncError(null);
    try {
      const res = await fetch("/api/commands/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Sync failed");
      }
      setSyncStatus(
        `Synced ${data.commandCount} command(s) to Discord successfully.`,
      );
      setPendingNameSync(false);
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  const { saveBarRef } = useUnsavedChanges({
    isDirty: isPermissionsDirty,
    onDiscard: () => setDraft(null),
  });

  if (loading || catalogLoading) return <p className="muted">Loading…</p>;

  return (
    <>
      <PageHeader
        title="Command permissions"
        description="Select which role keys can run each slash command. Empty selection = public (no role gate)."
        actions={
          <div className="row" style={{ gap: "0.5rem" }}>
            {pendingNameSync ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={onSync}
                disabled={syncing || saving || isNamesDirty}
              >
                {syncing ? "Syncing…" : "Sync to Discord"}
              </button>
            ) : null}
            {editingNames ? (
              <>
                <button
                  type="button"
                  className="btn"
                  onClick={cancelEditingNames}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={onSaveNames}
                  disabled={
                    saving || !isNamesDirty || !nameValidation.ok
                  }
                >
                  {saving ? "Saving…" : "Save names"}
                </button>
              </>
            ) : (
              <button
                type="button"
                className="btn"
                onClick={startEditingNames}
                disabled={saving || isPermissionsDirty}
              >
                Edit names
              </button>
            )}
          </div>
        }
      />
      <RestartBanner />
      {pendingNameSync ? (
        <div className="restart-banner">
          Name changes are saved but not live in Discord until you click{" "}
          <strong>Sync to Discord</strong>.
        </div>
      ) : null}
      {error ? <p className="status err">{error}</p> : null}
      {catalogError ? <p className="status err">{catalogError}</p> : null}
      {status ? <p className="status ok">{status}</p> : null}
      {syncError ? <p className="status err">{syncError}</p> : null}
      {syncStatus ? <p className="status ok">{syncStatus}</p> : null}
      {!nameValidation.ok && editingNames ? (
        <p className="status err">{"errors" in nameValidation ? nameValidation.errors.join("; ") : ""}</p>
      ) : null}

      <div className="card stack">
        <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
          Ban appeal approver roles are managed on{" "}
          <Link href="/moderation/ban-messages" style={{ color: "var(--accent)" }}>
            Moderation → Ban messages
          </Link>
          . Commands are synced from the bot catalog automatically. Use{" "}
          <strong>Edit names</strong> to customize slash command names shown in
          Discord.
        </p>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Command</th>
                <th>Allowed roles</th>
              </tr>
            </thead>
            <tbody>
              {editableCommands
                .slice()
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((command) => {
                  const cmd = command.name;
                  const rowError = rowNameErrors[cmd];

                  return (
                    <tr key={cmd}>
                      <td>
                        {editingNames ? (
                          <div className="stack" style={{ gap: "0.25rem" }}>
                            <input
                              className="input mono"
                              value={currentNameDraft[cmd] ?? ""}
                              placeholder={cmd}
                              onChange={(event) =>
                                setCommandDisplayName(cmd, event.target.value)
                              }
                            />
                            <span className="muted" style={{ fontSize: "0.8rem" }}>
                              default: /{cmd}
                            </span>
                            {rowError ? (
                              <span className="status err" style={{ fontSize: "0.8rem" }}>
                                {rowError}
                              </span>
                            ) : null}
                          </div>
                        ) : (
                          <div className="stack" style={{ gap: "0.15rem" }}>
                            <span className="mono">/{command.effectiveName}</span>
                            {command.displayName ? (
                              <span className="muted" style={{ fontSize: "0.8rem" }}>
                                default: /{cmd}
                              </span>
                            ) : null}
                          </div>
                        )}
                      </td>
                      <td>
                        <RolePicker
                          roles={roles}
                          selectedKeys={permissions[cmd] || []}
                          onChange={(keys) => setCommandRoles(cmd, keys)}
                        />
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
        <div className="row row-end">
          <SaveActions
            saveBarRef={saveBarRef}
            isDirty={isPermissionsDirty}
            saving={saving}
            onSave={onSavePermissions}
            onDiscard={() => setDraft(null)}
            saveLabel="Save permissions"
          />
        </div>
      </div>
    </>
  );
}
