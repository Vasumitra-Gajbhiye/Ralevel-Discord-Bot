"use client";

import { useState } from "react";
import { PageHeader, RestartBanner } from "@/components/PageHeader";
import { useGuildConfig, type GuildConfigData } from "@/lib/useGuildConfig";

export default function RanksPage() {
  const { config, loading, error, saving, status, save } = useGuildConfig();
  const [draft, setDraft] = useState<GuildConfigData["ranks"] | null>(null);
  const ranks = draft ?? config?.ranks;

  if (loading || !ranks) return <p className="muted">Loading…</p>;

  return (
    <>
      <PageHeader
        title="XP / Ranks"
        description="XP ladder role IDs, booster multiplier, and level-up channel key."
      />
      <RestartBanner />
      {error ? <p className="status err">{error}</p> : null}
      {status ? <p className="status ok">{status}</p> : null}

      <div className="card stack">
        <div className="row">
          <div className="field">
            <label>Level-up channel key</label>
            <input
              value={ranks.levelUpChannelKey}
              onChange={(e) =>
                setDraft({ ...ranks, levelUpChannelKey: e.target.value })
              }
            />
          </div>
          <div className="field">
            <label>Booster role key</label>
            <input
              value={ranks.boosterRoleKey}
              onChange={(e) =>
                setDraft({ ...ranks, boosterRoleKey: e.target.value })
              }
            />
          </div>
          <div className="field">
            <label>Booster XP multiplier</label>
            <input
              type="number"
              step="0.1"
              value={ranks.boosterMultiplier}
              onChange={(e) =>
                setDraft({
                  ...ranks,
                  boosterMultiplier: Number(e.target.value) || 1,
                })
              }
            />
          </div>
        </div>

        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Role ID</th>
                <th>XP threshold</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {ranks.ladder.map((row, i) => (
                <tr key={i}>
                  <td>
                    <input
                      className="mono"
                      value={row.roleId}
                      onChange={(e) => {
                        const ladder = [...ranks.ladder];
                        ladder[i] = { ...row, roleId: e.target.value };
                        setDraft({ ...ranks, ladder });
                      }}
                      style={{ width: "100%" }}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={row.xp}
                      onChange={(e) => {
                        const ladder = [...ranks.ladder];
                        ladder[i] = {
                          ...row,
                          xp: Number(e.target.value) || 0,
                        };
                        setDraft({ ...ranks, ladder });
                      }}
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={() =>
                        setDraft({
                          ...ranks,
                          ladder: ranks.ladder.filter((_, j) => j !== i),
                        })
                      }
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="row">
          <button
            type="button"
            className="btn"
            onClick={() =>
              setDraft({
                ...ranks,
                ladder: [...ranks.ladder, { roleId: "", xp: 0 }],
              })
            }
          >
            Add rank
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={saving}
            onClick={async () => {
              await save({ ranks });
              setDraft(null);
            }}
          >
            {saving ? "Saving…" : "Save ranks"}
          </button>
        </div>
      </div>
    </>
  );
}
