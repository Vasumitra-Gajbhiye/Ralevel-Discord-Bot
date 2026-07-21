"use client";

import { useState } from "react";
import { PageHeader, RestartBanner } from "@/components/PageHeader";
import { useGuildConfig, type GuildConfigData } from "@/lib/useGuildConfig";

export default function ReputationSettingsPage() {
  const { config, loading, error, saving, status, save } = useGuildConfig();
  const [draft, setDraft] = useState<GuildConfigData["reputation"] | null>(
    null,
  );
  const rep = draft ?? config?.reputation;

  if (loading || !rep) return <p className="muted">Loading…</p>;

  return (
    <>
      <PageHeader
        title="Reputation settings"
        description="Tiers, detection words, and disabled channels/categories."
      />
      <RestartBanner />
      {error ? <p className="status err">{error}</p> : null}
      {status ? <p className="status ok">{status}</p> : null}

      <div className="stack">
        <div className="card stack">
          <h3 style={{ margin: 0, fontSize: "1rem" }}>Tiers</h3>
          {rep.tiers.map((tier, i) => (
            <div className="row" key={i}>
              <div className="field">
                <label>Role key</label>
                <input
                  value={tier.roleKey}
                  onChange={(e) => {
                    const tiers = [...rep.tiers];
                    tiers[i] = { ...tier, roleKey: e.target.value };
                    setDraft({ ...rep, tiers });
                  }}
                />
              </div>
              <div className="field">
                <label>Threshold</label>
                <input
                  type="number"
                  value={tier.threshold}
                  onChange={(e) => {
                    const tiers = [...rep.tiers];
                    tiers[i] = {
                      ...tier,
                      threshold: Number(e.target.value) || 0,
                    };
                    setDraft({ ...rep, tiers });
                  }}
                />
              </div>
              <div className="field">
                <label>Label</label>
                <input
                  value={tier.label}
                  onChange={(e) => {
                    const tiers = [...rep.tiers];
                    tiers[i] = { ...tier, label: e.target.value };
                    setDraft({ ...rep, tiers });
                  }}
                />
              </div>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() =>
                  setDraft({
                    ...rep,
                    tiers: rep.tiers.filter((_, j) => j !== i),
                  })
                }
              >
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn"
            onClick={() =>
              setDraft({
                ...rep,
                tiers: [
                  ...rep.tiers,
                  { roleKey: "beginner", threshold: 10, label: "New tier" },
                ],
              })
            }
          >
            Add tier
          </button>
        </div>

        <div className="card stack">
          <div className="field">
            <label>Thank words (one per line)</label>
            <textarea
              value={rep.thankWords.join("\n")}
              onChange={(e) =>
                setDraft({
                  ...rep,
                  thankWords: e.target.value
                    .split("\n")
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
            />
          </div>
          <div className="field">
            <label>Welcome / yw words (one per line)</label>
            <textarea
              value={rep.welcomeWords.join("\n")}
              onChange={(e) =>
                setDraft({
                  ...rep,
                  welcomeWords: e.target.value
                    .split("\n")
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
            />
          </div>
          <div className="field">
            <label>Disabled channel IDs (comma-separated)</label>
            <input
              className="mono"
              value={rep.disabledChannels.join(", ")}
              onChange={(e) =>
                setDraft({
                  ...rep,
                  disabledChannels: e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
            />
          </div>
          <div className="field">
            <label>Disabled category IDs (comma-separated)</label>
            <input
              className="mono"
              value={rep.disabledCategories.join(", ")}
              onChange={(e) =>
                setDraft({
                  ...rep,
                  disabledCategories: e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
            />
          </div>
          <div className="field">
            <label>Staff channel IDs (comma-separated)</label>
            <input
              className="mono"
              value={rep.staffChannelIds.join(", ")}
              onChange={(e) =>
                setDraft({
                  ...rep,
                  staffChannelIds: e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
            />
          </div>
        </div>

        <button
          type="button"
          className="btn btn-primary"
          disabled={saving}
          onClick={async () => {
            await save({ reputation: rep });
            setDraft(null);
          }}
        >
          {saving ? "Saving…" : "Save reputation settings"}
        </button>
      </div>
    </>
  );
}
