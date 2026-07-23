"use client";

import { useMemo, useState } from "react";
import { PageHeader, RestartBanner } from "@/components/PageHeader";
import { SaveActions } from "@/components/SaveActions";
import { useGuildConfig, type GuildConfigData } from "@/lib/useGuildConfig";
import { isDraftDirty, useUnsavedChanges } from "@/lib/unsaved-changes";

export default function ConfessionsSettingsPage() {
  const { config, loading, error, saving, status, save } = useGuildConfig();
  const [draft, setDraft] = useState<GuildConfigData["confessions"] | null>(
    null,
  );

  const savedConfessions = useMemo(
    () => config?.confessions,
    [config?.confessions],
  );
  const confessions = draft ?? savedConfessions;
  const channelOptions = config?.channels ?? [];

  const isDirty = useMemo(
    () => isDraftDirty(draft, savedConfessions),
    [draft, savedConfessions],
  );

  async function onSave() {
    if (!confessions) return;
    await save({ confessions });
    setDraft(null);
  }

  const { saveBarRef } = useUnsavedChanges({
    isDirty,
    onDiscard: () => setDraft(null),
  });

  if (loading || !confessions) return <p className="muted">Loading…</p>;

  return (
    <>
      <PageHeader
        title="Confession settings"
        description="Channel keys and roles that can approve/reject confessions."
      />
      <RestartBanner />
      {error ? <p className="status err">{error}</p> : null}
      {status ? <p className="status ok">{status}</p> : null}
      <div className="card stack">
        <div className="row">
          <div className="field">
            <label>Mod queue channel key</label>
            <select
              value={confessions.modChannelKey}
              onChange={(e) =>
                setDraft({ ...confessions, modChannelKey: e.target.value })
              }
            >
              {channelOptions.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label ? `${c.label} (${c.key})` : c.key}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Vent channel key</label>
            <select
              value={confessions.ventChannelKey}
              onChange={(e) =>
                setDraft({ ...confessions, ventChannelKey: e.target.value })
              }
            >
              {channelOptions.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label ? `${c.label} (${c.key})` : c.key}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="field">
          <label>Approver role keys (comma-separated)</label>
          <input
            value={confessions.approverRoleKeys.join(", ")}
            onChange={(e) =>
              setDraft({
                ...confessions,
                approverRoleKeys: e.target.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
              })
            }
          />
        </div>
        <SaveActions
          saveBarRef={saveBarRef}
          isDirty={isDirty}
          saving={saving}
          onSave={onSave}
          onDiscard={() => setDraft(null)}
          saveLabel="Save confession settings"
        />
      </div>
    </>
  );
}
