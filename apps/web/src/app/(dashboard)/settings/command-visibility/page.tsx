"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { SaveActions } from "@/components/SaveActions";
import { useGuildConfig } from "@/lib/useGuildConfig";
import { isDraftDirty, useUnsavedChanges } from "@/lib/unsaved-changes";

type CatalogCommand = {
  category: string;
  name: string;
  fileDefault: string | null;
  saved: string | null | undefined;
  effective: string | null;
};

type PermissionOption = {
  value: string;
  label: string;
};

function permissionToValue(permission: string | null | undefined) {
  return permission ?? "";
}

function formatPermissionLabel(
  value: string,
  options: PermissionOption[],
) {
  return options.find((option) => option.value === value)?.label ?? "Everyone";
}

export default function CommandVisibilityPage() {
  const { loading: configLoading, error, saving, status, save } =
    useGuildConfig();
  const [catalog, setCatalog] = useState<CatalogCommand[]>([]);
  const [permissionOptions, setPermissionOptions] = useState<PermissionOption[]>(
    [],
  );
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string> | null>(null);
  const [filter, setFilter] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true);
    setCatalogError(null);
    try {
      const res = await fetch("/api/commands/catalog");
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as {
        commands: CatalogCommand[];
        permissionOptions: PermissionOption[];
      };
      setCatalog(data.commands);
      setPermissionOptions(data.permissionOptions);
    } catch (e) {
      setCatalogError(
        e instanceof Error ? e.message : "Failed to load command catalog",
      );
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  const basePermissions = useMemo(() => {
    const next: Record<string, string> = {};
    for (const command of catalog) {
      next[command.name] = permissionToValue(command.effective);
    }
    return next;
  }, [catalog]);

  const permissions = draft ?? basePermissions;

  const isDirty = useMemo(
    () => isDraftDirty(draft, basePermissions),
    [draft, basePermissions],
  );

  const filteredCommands = useMemo(() => {
    const query = filter.trim().toLowerCase();
    if (!query) return catalog;
    return catalog.filter(
      (command) =>
        command.name.toLowerCase().includes(query) ||
        command.category.toLowerCase().includes(query),
    );
  }, [catalog, filter]);

  function setCommandPermission(commandName: string, value: string) {
    setDraft({ ...permissions, [commandName]: value });
  }

  async function onSave() {
    await save({ commandDiscordPermissions: permissions });
    setDraft(null);
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
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  const { saveBarRef } = useUnsavedChanges({
    isDirty,
    onDiscard: () => setDraft(null),
  });

  const loading = configLoading || catalogLoading;

  if (loading) return <p className="muted">Loading…</p>;

  return (
    <>
      <PageHeader
        title="Command visibility"
        description="Control which Discord server permissions are required to see each slash command in Discord's command picker. This is separate from the role-based runtime gate on the Commands settings page."
        actions={
          <button
            type="button"
            className="btn btn-primary"
            onClick={onSync}
            disabled={syncing || saving || isDirty}
          >
            {syncing ? "Syncing…" : "Sync to Discord"}
          </button>
        }
      />

      <div className="restart-banner">
        Save stores settings in MongoDB. Click <strong>Sync to Discord</strong>{" "}
        to apply visibility changes in Discord. In production, the web server
        needs <code>TOKEN</code> and <code>CLIENT_ID</code>, or a bot sync proxy
        configured — see <code>docs/environment-variables.md</code>.
      </div>

      {error ? <p className="status err">{error}</p> : null}
      {status ? <p className="status ok">{status}</p> : null}
      {catalogError ? <p className="status err">{catalogError}</p> : null}
      {syncError ? <p className="status err">{syncError}</p> : null}
      {syncStatus ? <p className="status ok">{syncStatus}</p> : null}

      <div className="card stack">
        <div className="row row-between">
          <input
            type="search"
            className="input"
            placeholder="Filter by command or category…"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
        </div>

        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Command</th>
                <th>Category</th>
                <th>Discord permission</th>
                <th>File default</th>
              </tr>
            </thead>
            <tbody>
              {filteredCommands.map((command) => {
                const value = permissions[command.name] ?? "";
                const changedFromFile =
                  permissionToValue(command.fileDefault) !== value;

                return (
                  <tr key={command.name}>
                    <td className="mono">/{command.name}</td>
                    <td>{command.category}</td>
                    <td>
                      <select
                        className="input"
                        value={value}
                        onChange={(event) =>
                          setCommandPermission(command.name, event.target.value)
                        }
                      >
                        {permissionOptions.map((option) => (
                          <option key={option.value || "everyone"} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className={changedFromFile ? "status warn" : "muted"}>
                      {formatPermissionLabel(
                        permissionToValue(command.fileDefault),
                        permissionOptions,
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <SaveActions
          saveBarRef={saveBarRef}
          isDirty={isDirty}
          saving={saving}
          onSave={onSave}
          onDiscard={() => setDraft(null)}
          saveLabel="Save visibility"
        />
      </div>
    </>
  );
}
