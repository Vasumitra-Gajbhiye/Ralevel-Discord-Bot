"use client";

import { useState } from "react";
import { PageHeader, RestartBanner } from "@/components/PageHeader";
import { CHANNEL_KEYS } from "@/lib/nav";
import { useGuildConfig } from "@/lib/useGuildConfig";

export default function ChannelsPage() {
  const { config, loading, error, saving, status, save } = useGuildConfig();
  const [draft, setDraft] = useState<Record<string, string> | null>(null);

  const channels = draft ?? config?.channels ?? {};

  async function onSave() {
    await save({ channels });
    setDraft(null);
  }

  if (loading) return <p className="muted">Loading…</p>;

  return (
    <>
      <PageHeader
        title="Channels"
        description="Discord channel snowflake IDs used by bot features."
      />
      <RestartBanner />
      {error ? <p className="status err">{error}</p> : null}
      {status ? <p className="status ok">{status}</p> : null}

      <div className="card stack">
        {CHANNEL_KEYS.map(({ key, label }) => (
          <div className="field" key={key}>
            <label>
              {label} <span className="mono">({key})</span>
            </label>
            <input
              className="mono"
              value={channels[key] || ""}
              onChange={(e) =>
                setDraft({ ...channels, [key]: e.target.value.trim() })
              }
            />
          </div>
        ))}
        <div className="row">
          <button
            type="button"
            className="btn btn-primary"
            disabled={saving}
            onClick={onSave}
          >
            {saving ? "Saving…" : "Save channels"}
          </button>
        </div>
      </div>
    </>
  );
}
