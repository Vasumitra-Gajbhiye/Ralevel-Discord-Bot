"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
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

export default function CommandsPage() {
  const { config, loading, error, saving, status, save } = useGuildConfig();
  const [draft, setDraft] = useState<Record<string, string[]> | null>(null);
  const [catalog, setCatalog] = useState<CatalogCommand[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const savedPermissions = useMemo(
    () => config?.commandPermissions ?? {},
    [config?.commandPermissions],
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

  const commandNames = useMemo(() => {
    return catalog
      .map((cmd) => cmd.name)
      .filter((cmd) => !BAN_APPEAL_COMMANDS.has(cmd))
      .sort();
  }, [catalog]);

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

  const isDirty = useMemo(
    () => isDraftDirty(draft, normalizedSaved),
    [draft, normalizedSaved],
  );

  const roles = config?.roles ?? [];

  function setCommandRoles(command: string, keys: string[]) {
    setDraft({ ...permissions, [command]: keys });
  }

  async function onSave() {
    const nextPermissions = buildPermissionsToSave(
      commandNames,
      permissions,
      savedPermissions,
    );
    await save({ commandPermissions: nextPermissions });
    setDraft(null);
  }

  const { saveBarRef } = useUnsavedChanges({
    isDirty,
    onDiscard: () => setDraft(null),
  });

  if (loading || catalogLoading) return <p className="muted">Loading…</p>;

  return (
    <>
      <PageHeader
        title="Command permissions"
        description="Select which role keys can run each slash command. Empty selection = public (no role gate)."
      />
      <RestartBanner />
      {error ? <p className="status err">{error}</p> : null}
      {catalogError ? <p className="status err">{catalogError}</p> : null}
      {status ? <p className="status ok">{status}</p> : null}

      <div className="card stack">
        <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
          Ban appeal approver roles are managed on{" "}
          <Link href="/moderation/ban-messages" style={{ color: "var(--accent)" }}>
            Moderation → Ban messages
          </Link>
          . Commands are synced from the bot catalog automatically.
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
        <div className="row row-end">
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
