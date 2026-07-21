"use client";

import { useState } from "react";
import { PageHeader, RestartBanner } from "@/components/PageHeader";
import { CHANNEL_KEYS } from "@/lib/nav";
import { useGuildConfig, type GuildConfigData } from "@/lib/useGuildConfig";

export default function ConfessionsSettingsPage() {
  const { config, loading, error, saving, status, save } = useGuildConfig();
  const [draft, setDraft] = useState<GuildConfigData["confessions"] | null>(
    null,
  );
  const confessions = draft ?? config?.confessions;
  const channelOptions = CHANNEL_KEYS.map((c) => c.key);

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
              {channelOptions.map((k) => (
                <option key={k} value={k}>
                  {k}
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
              {channelOptions.map((k) => (
                <option key={k} value={k}>
                  {k}
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
        <button
          type="button"
          className="btn btn-primary"
          disabled={saving}
          onClick={async () => {
            await save({ confessions });
            setDraft(null);
          }}
        >
          {saving ? "Saving…" : "Save confession settings"}
        </button>
      </div>
    </>
  );
}
