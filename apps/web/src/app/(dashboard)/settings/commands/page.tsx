"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { validateCommandDisplayNames } from "@ralevel/shared/commandDisplayNames";
import {
  buildMetadataOverrideFromEditable,
  type EditableMetadata,
} from "@ralevel/shared/commandMetadataOverrides";
import { CommandEditModal } from "@/components/CommandEditModal";
import { PageHeader, RestartBanner } from "@/components/PageHeader";
import { RolePicker } from "@/components/RolePicker";
import { SaveActions } from "@/components/SaveActions";
import { useGuildConfig } from "@/lib/useGuildConfig";
import { isDraftDirty, useUnsavedChanges } from "@/lib/unsaved-changes";

const BAN_APPEAL_COMMANDS = new Set([
  "ban-appeal-approved",
  "ban-appeal-rejected",
]);

const DESCRIPTION_PREVIEW_LENGTH = 80;

type CatalogCommand = {
  name: string;
  displayName: string | null;
  effectiveName: string;
  description: string;
  defaultDescription: string;
  editableMetadata: EditableMetadata;
  defaultEphemeral: boolean;
};

function truncateDescription(text: string, maxLength = DESCRIPTION_PREVIEW_LENGTH) {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trimEnd()}…`;
}

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

function buildEphemeralToSave(
  catalogNames: string[],
  current: Record<string, boolean>,
  saved: Record<string, boolean>,
  defaults: Record<string, boolean>,
) {
  const catalogSet = new Set(catalogNames);
  const merged = { ...saved };

  for (const cmd of catalogNames) {
    merged[cmd] = current[cmd] ?? saved[cmd] ?? defaults[cmd] ?? false;
  }

  for (const key of Object.keys(merged)) {
    if (!catalogSet.has(key) && !BAN_APPEAL_COMMANDS.has(key)) {
      delete merged[key];
    }
  }

  return merged;
}

function EditCommandIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M11.333 2.667l2 2-8.666 8.666H2.667v-2.666L11.333 2.667z"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
      <path
        d="M9.333 4.667l2 2"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Open eye — reply visible to everyone (ephemeral: false) */
function EyeOpenIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8s-2.5 4.5-6.5 4.5S1.5 8 1.5 8z"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.25" />
    </svg>
  );
}

/** Closed eye — reply visible only to user (ephemeral: true) */
function EyeClosedIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8s-2.5 4.5-6.5 4.5S1.5 8 1.5 8z"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.25" />
      <path
        d="M2.5 2.5l11 11"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function CommandsPage() {
  const { config, loading, error, saving, status, save } = useGuildConfig();
  const [draft, setDraft] = useState<Record<string, string[]> | null>(null);
  const [ephemeralDraft, setEphemeralDraft] = useState<Record<
    string,
    boolean
  > | null>(null);
  const [catalog, setCatalog] = useState<CatalogCommand[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [pendingDiscordSync, setPendingDiscordSync] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [editingCommandName, setEditingCommandName] = useState<string | null>(
    null,
  );
  const [modalSaving, setModalSaving] = useState(false);

  const savedPermissions = useMemo(
    () => config?.commandPermissions ?? {},
    [config?.commandPermissions],
  );

  const savedEphemeral = useMemo(
    () => config?.commandEphemeral ?? {},
    [config?.commandEphemeral],
  );

  const savedDisplayNames = useMemo(
    () => config?.commandDisplayNames ?? {},
    [config?.commandDisplayNames],
  );

  const savedMetadataOverrides = useMemo(
    () => config?.commandMetadataOverrides ?? {},
    [config?.commandMetadataOverrides],
  );

  const ephemeralDefaults = useMemo(() => {
    const defaults: Record<string, boolean> = {};
    for (const cmd of catalog) {
      defaults[cmd.name] = cmd.defaultEphemeral ?? false;
    }
    return defaults;
  }, [catalog]);

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

  const editingCommand = useMemo(() => {
    if (!editingCommandName) return null;
    return (
      editableCommands.find((command) => command.name === editingCommandName) ??
      null
    );
  }, [editableCommands, editingCommandName]);

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

  const ephemeral = useMemo(() => {
    const base = ephemeralDraft ?? savedEphemeral;
    const merged = { ...base };
    for (const cmd of commandNames) {
      if (!(cmd in merged)) {
        merged[cmd] = savedEphemeral[cmd] ?? ephemeralDefaults[cmd] ?? false;
      }
    }
    return merged;
  }, [ephemeralDraft, savedEphemeral, commandNames, ephemeralDefaults]);

  const normalizedSaved = useMemo(() => {
    const merged = { ...savedPermissions };
    for (const cmd of commandNames) {
      if (!(cmd in merged)) {
        merged[cmd] = [];
      }
    }
    return merged;
  }, [savedPermissions, commandNames]);

  const normalizedSavedEphemeral = useMemo(() => {
    const merged = { ...savedEphemeral };
    for (const cmd of commandNames) {
      if (!(cmd in merged)) {
        merged[cmd] = ephemeralDefaults[cmd] ?? false;
      }
    }
    return merged;
  }, [savedEphemeral, commandNames, ephemeralDefaults]);

  const isPermissionsDirty = useMemo(
    () => isDraftDirty(draft, normalizedSaved),
    [draft, normalizedSaved],
  );

  const isEphemeralDirty = useMemo(
    () => isDraftDirty(ephemeralDraft, normalizedSavedEphemeral),
    [ephemeralDraft, normalizedSavedEphemeral],
  );

  const isDirty = isPermissionsDirty || isEphemeralDirty;

  const roles = config?.roles ?? [];

  function setCommandRoles(command: string, keys: string[]) {
    setDraft({ ...permissions, [command]: keys });
  }

  function toggleCommandEphemeral(command: string) {
    setEphemeralDraft({
      ...ephemeral,
      [command]: !ephemeral[command],
    });
  }

  function onDiscard() {
    setDraft(null);
    setEphemeralDraft(null);
  }

  async function onSave() {
    const patch: {
      commandPermissions?: Record<string, string[]>;
      commandEphemeral?: Record<string, boolean>;
    } = {};

    if (isPermissionsDirty) {
      patch.commandPermissions = buildPermissionsToSave(
        commandNames,
        permissions,
        savedPermissions,
      );
    }
    if (isEphemeralDirty) {
      patch.commandEphemeral = buildEphemeralToSave(
        commandNames,
        ephemeral,
        savedEphemeral,
        ephemeralDefaults,
      );
    }

    await save(patch);
    setDraft(null);
    setEphemeralDraft(null);
  }

  async function onSaveCommandEdit({
    displayName,
    editableMetadata,
  }: {
    displayName: string;
    editableMetadata: EditableMetadata;
  }) {
    if (!editingCommand) return;

    setModalSaving(true);
    try {
      const displayNameDraft = {
        ...savedDisplayNames,
        [editingCommand.name]: displayName,
      };
      const displayNameValidation = validateCommandDisplayNames(
        editableCommands,
        displayNameDraft,
      );
      if (!displayNameValidation.ok) {
        throw new Error(displayNameValidation.errors.join("; "));
      }

      const metadataOverride = buildMetadataOverrideFromEditable(
        {},
        editableMetadata,
      );
      const nextMetadataOverrides = {
        ...savedMetadataOverrides,
      };
      if (metadataOverride) {
        nextMetadataOverrides[editingCommand.name] = metadataOverride;
      } else {
        delete nextMetadataOverrides[editingCommand.name];
      }

      await save({
        commandDisplayNames: displayNameValidation.displayNames,
        commandMetadataOverrides: nextMetadataOverrides,
      });
      setEditingCommandName(null);
      setPendingDiscordSync(true);
      await loadCatalog();
    } finally {
      setModalSaving(false);
    }
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
      setPendingDiscordSync(false);
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  const { saveBarRef } = useUnsavedChanges({
    isDirty,
    onDiscard,
  });

  if (loading || catalogLoading) return <p className="muted">Loading…</p>;

  return (
    <>
      <PageHeader
        title="Command permissions"
        description="Select which role keys can run each slash command. Empty selection = public (no role gate). Use the eye icon to toggle whether replies are visible only to the user."
        actions={
          pendingDiscordSync ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={onSync}
              disabled={syncing || saving || modalSaving}
            >
              {syncing ? "Syncing…" : "Sync to Discord"}
            </button>
          ) : null
        }
      />
      <RestartBanner />
      {pendingDiscordSync ? (
        <div className="restart-banner">
          Command changes are saved but not live in Discord until you click{" "}
          <strong>Sync to Discord</strong>.
        </div>
      ) : null}
      {error ? <p className="status err">{error}</p> : null}
      {catalogError ? <p className="status err">{catalogError}</p> : null}
      {status ? <p className="status ok">{status}</p> : null}
      {syncError ? <p className="status err">{syncError}</p> : null}
      {syncStatus ? <p className="status ok">{syncStatus}</p> : null}

      <div className="card stack">
        <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
          Ban appeal approver roles are managed on{" "}
          <Link href="/moderation/ban-messages" style={{ color: "var(--accent)" }}>
            Moderation → Ban messages
          </Link>
          . Commands are synced from the bot catalog automatically. Click the pen
          icon on a command to edit its name, description, and option text.
          Closed eye = visible only to the user; open eye = visible to everyone.
        </p>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Command</th>
                <th>Allowed roles</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {editableCommands
                .slice()
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((command) => {
                  const cmd = command.name;
                  const isEphemeral = ephemeral[cmd] ?? false;

                  return (
                    <tr key={cmd}>
                      <td>
                        <div className="stack" style={{ gap: "0.15rem" }}>
                          <span
                            className="mono"
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "0.35rem",
                            }}
                          >
                            /{command.effectiveName}
                            <button
                              type="button"
                              className="btn btn-icon"
                              aria-label={
                                isEphemeral
                                  ? "Visible only to user (click to show to everyone)"
                                  : "Visible to everyone (click to show only to user)"
                              }
                              title={
                                isEphemeral
                                  ? "Visible only to user"
                                  : "Visible to everyone"
                              }
                              onClick={() => toggleCommandEphemeral(cmd)}
                              disabled={saving || modalSaving}
                            >
                              {isEphemeral ? (
                                <EyeClosedIcon />
                              ) : (
                                <EyeOpenIcon />
                              )}
                            </button>
                          </span>
                          {command.displayName ? (
                            <span className="muted" style={{ fontSize: "0.8rem" }}>
                              default: /{cmd}
                            </span>
                          ) : null}
                          {command.description ? (
                            <span
                              className="muted"
                              style={{ fontSize: "0.8rem", lineHeight: 1.4 }}
                              title={command.description}
                            >
                              {truncateDescription(command.description)}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td>
                        <RolePicker
                          roles={roles}
                          selectedKeys={permissions[cmd] || []}
                          onChange={(keys) => setCommandRoles(cmd, keys)}
                        />
                      </td>
                      <td style={{ width: "3rem", textAlign: "right" }}>
                        <button
                          type="button"
                          className="btn btn-icon"
                          aria-label={`Edit /${cmd}`}
                          onClick={() => setEditingCommandName(cmd)}
                          disabled={saving || modalSaving}
                        >
                          <EditCommandIcon />
                        </button>
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
            isDirty={isDirty}
            saving={saving}
            onSave={onSave}
            onDiscard={onDiscard}
            saveLabel="Save changes"
          />
        </div>
      </div>

      <CommandEditModal
        open={Boolean(editingCommand)}
        command={editingCommand}
        saving={modalSaving || saving}
        onCancel={() => setEditingCommandName(null)}
        onSave={onSaveCommandEdit}
      />
    </>
  );
}
