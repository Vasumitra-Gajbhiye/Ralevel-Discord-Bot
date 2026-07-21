"use client";

import { useMemo, useState } from "react";
import { PageHeader, RestartBanner } from "@/components/PageHeader";
import { CHANNEL_KEYS } from "@/lib/nav";
import { useGuildConfig } from "@/lib/useGuildConfig";

type ChannelsDraft = {
  channels: Record<string, string>;
  channelLabels: Record<string, string>;
};

export default function ChannelsPage() {
  const { config, loading, error, saving, status, save } = useGuildConfig();
  const [draft, setDraft] = useState<ChannelsDraft | null>(null);

  const savedChannels = useMemo(
    () => config?.channels ?? {},
    [config?.channels],
  );
  const savedLabels = useMemo(
    () => config?.channelLabels ?? {},
    [config?.channelLabels],
  );

  const channels = draft?.channels ?? savedChannels;
  const channelLabels = draft?.channelLabels ?? savedLabels;

  const isDirty = useMemo(
    () =>
      draft !== null &&
      (JSON.stringify(draft.channels) !== JSON.stringify(savedChannels) ||
        JSON.stringify(draft.channelLabels) !== JSON.stringify(savedLabels)),
    [draft, savedChannels, savedLabels],
  );

  function updateChannel(key: string, value: string) {
    setDraft({
      channels: { ...channels, [key]: value },
      channelLabels: { ...channelLabels },
    });
  }

  function updateLabel(key: string, value: string) {
    setDraft({
      channels: { ...channels },
      channelLabels: { ...channelLabels, [key]: value },
    });
  }

  async function onSave() {
    await save({ channels, channelLabels });
    setDraft(null);
  }

  if (loading) return <p className="muted">Loading…</p>;

  return (
    <>
      <PageHeader
        title="Channels"
        description="Discord channel snowflake IDs used by bot features. Add optional display names to remember what each channel is."
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
            <div className="row" style={{ gap: "0.75rem", flexWrap: "wrap" }}>
              <div className="field" style={{ flex: "1 1 12rem", margin: 0 }}>
                <label className="muted" style={{ fontSize: "0.8rem" }}>
                  Display name
                </label>
                <input
                  placeholder="e.g. #welcome"
                  value={channelLabels[key] || ""}
                  onChange={(e) => updateLabel(key, e.target.value)}
                />
              </div>
              <div className="field" style={{ flex: "1 1 16rem", margin: 0 }}>
                <label className="muted" style={{ fontSize: "0.8rem" }}>
                  Channel ID
                </label>
                <input
                  className="mono"
                  value={channels[key] || ""}
                  onChange={(e) => updateChannel(key, e.target.value.trim())}
                />
              </div>
            </div>
          </div>
        ))}
        <div className="row row-between">
          <div />
          <div className="row">
            {isDirty ? (
              <span className="muted" style={{ fontSize: "0.8rem" }}>
                Unsaved changes
              </span>
            ) : null}
            <button
              type="button"
              className="btn btn-primary"
              disabled={!isDirty || saving}
              onClick={onSave}
            >
              {saving ? "Saving…" : "Save channels"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
