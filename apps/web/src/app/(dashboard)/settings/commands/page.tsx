"use client";

import { useMemo, useState } from "react";
import { PageHeader, RestartBanner } from "@/components/PageHeader";
import { RolePicker } from "@/components/RolePicker";
import { SaveActions } from "@/components/SaveActions";
import { useGuildConfig } from "@/lib/useGuildConfig";
import { isDraftDirty, useUnsavedChanges } from "@/lib/unsaved-changes";

export default function CommandsPage() {
  const { config, loading, error, saving, status, save } = useGuildConfig();
  const [draft, setDraft] = useState<Record<string, string[]> | null>(null);

  const savedPermissions = useMemo(
    () => config?.commandPermissions ?? {},
    [config?.commandPermissions],
  );
  const permissions = draft ?? savedPermissions;

  const isDirty = useMemo(
    () => isDraftDirty(draft, savedPermissions),
    [draft, savedPermissions],
  );

  const roles = config?.roles ?? [];

  const commandNames = useMemo(() => {
    return Array.from(new Set(Object.keys(permissions))).sort();
  }, [permissions]);

  function setCommandRoles(command: string, keys: string[]) {
    setDraft({ ...permissions, [command]: keys });
  }

  function addCommand() {
    const name = prompt("Slash command name (must match Discord setName):");
    if (!name?.trim()) return;
    setDraft({ ...permissions, [name.trim()]: [] });
  }

  async function onSave() {
    await save({ commandPermissions: permissions });
    setDraft(null);
  }

  const { saveBarRef } = useUnsavedChanges({
    isDirty,
    onDiscard: () => setDraft(null),
  });

  if (loading) return <p className="muted">Loading…</p>;

  return (
    <>
      <PageHeader
        title="Command permissions"
        description="Select which role keys can run each slash command. Empty selection = public (no role gate)."
      />
      <RestartBanner />
      {error ? <p className="status err">{error}</p> : null}
      {status ? <p className="status ok">{status}</p> : null}

      <div className="card stack">
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Command</th>
                <th>Allowed roles</th>
              </tr>
            </thead>
            <tbody>
              {commandNames.map((cmd) => (
                <tr key={cmd}>
                  <td className="mono">/{cmd}</td>
                  <td>
                    <RolePicker
                      roles={roles}
                      selectedKeys={permissions[cmd] || []}
                      onChange={(keys) => setCommandRoles(cmd, keys)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="row row-between">
          <button type="button" className="btn" onClick={addCommand}>
            Add command
          </button>
          <SaveActions
            saveBarRef={saveBarRef}
            isDirty={isDirty}
            saving={saving}
            onSave={onSave}
            onDiscard={() => setDraft(null)}
            saveLabel="Save permissions"
          />
        </div>
      </div>
    </>
  );
}
