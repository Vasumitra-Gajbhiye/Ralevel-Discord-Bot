"use client";

import { useState } from "react";
import { PageHeader, RestartBanner } from "@/components/PageHeader";
import { useGuildConfig } from "@/lib/useGuildConfig";

export default function MiscSettingsPage() {
  const { config, loading, error, saving, status, save } = useGuildConfig();
  const [polls, setPolls] = useState<
    NonNullable<ReturnType<typeof useGuildConfig>["config"]>["polls"] | null
  >(null);
  const [sticky, setSticky] = useState<{ defaultLineThreshold: number } | null>(
    null,
  );
  const [helper, setHelper] = useState<{ pingDelayMs: number } | null>(null);

  const pollsData = polls ?? config?.polls;
  const stickyData = sticky ?? config?.sticky;
  const helperData = helper ?? config?.helper;

  if (loading || !pollsData || !stickyData || !helperData) {
    return <p className="muted">Loading…</p>;
  }

  return (
    <>
      <PageHeader
        title="Polls / Sticky / Helper"
        description="Misc feature thresholds and role gates."
      />
      <RestartBanner />
      {error ? <p className="status err">{error}</p> : null}
      {status ? <p className="status ok">{status}</p> : null}

      <div className="stack">
        <div className="card stack">
          <h3 style={{ margin: 0, fontSize: "1rem" }}>Polls</h3>
          <div className="field">
            <label>Breakdown role keys (comma-separated)</label>
            <input
              value={pollsData.breakdownRoleKeys.join(", ")}
              onChange={(e) =>
                setPolls({
                  ...pollsData,
                  breakdownRoleKeys: e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
            />
          </div>
          <div className="row">
            <div className="field">
              <label>Min options</label>
              <input
                type="number"
                value={pollsData.minOptions}
                onChange={(e) =>
                  setPolls({
                    ...pollsData,
                    minOptions: Number(e.target.value) || 2,
                  })
                }
              />
            </div>
            <div className="field">
              <label>Max options</label>
              <input
                type="number"
                value={pollsData.maxOptions}
                onChange={(e) =>
                  setPolls({
                    ...pollsData,
                    maxOptions: Number(e.target.value) || 24,
                  })
                }
              />
            </div>
          </div>
        </div>

        <div className="card stack">
          <h3 style={{ margin: 0, fontSize: "1rem" }}>Sticky</h3>
          <div className="field">
            <label>Default line threshold</label>
            <input
              type="number"
              min={1}
              value={stickyData.defaultLineThreshold}
              onChange={(e) =>
                setSticky({
                  defaultLineThreshold: Number(e.target.value) || 8,
                })
              }
            />
          </div>
        </div>

        <div className="card stack">
          <h3 style={{ margin: 0, fontSize: "1rem" }}>Helper</h3>
          <div className="field">
            <label>Ping delay (ms)</label>
            <input
              type="number"
              min={1000}
              value={helperData.pingDelayMs}
              onChange={(e) =>
                setHelper({ pingDelayMs: Number(e.target.value) || 10000 })
              }
            />
          </div>
        </div>

        <button
          type="button"
          className="btn btn-primary"
          disabled={saving}
          onClick={async () => {
            await save({
              polls: pollsData,
              sticky: stickyData,
              helper: helperData,
            });
            setPolls(null);
            setSticky(null);
            setHelper(null);
          }}
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </>
  );
}
