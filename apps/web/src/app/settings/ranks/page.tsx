"use client";

import { useMemo, useState } from "react";
import { AddRankModal } from "@/components/AddRankModal";
import { ConfirmModal } from "@/components/ConfirmModal";
import { PageHeader, RestartBanner } from "@/components/PageHeader";
import { useGuildConfig, type GuildConfigData } from "@/lib/useGuildConfig";

export default function RanksPage() {
  const { config, loading, error, saving, status, save } = useGuildConfig();
  const [draft, setDraft] = useState<GuildConfigData["ranks"] | null>(null);
  const [pendingRemoveIndex, setPendingRemoveIndex] = useState<number | null>(
    null,
  );
  const [showAddModal, setShowAddModal] = useState(false);

  const savedRanks = useMemo(() => config?.ranks, [config?.ranks]);
  const ranks = draft ?? savedRanks;

  const isDirty = useMemo(
    () =>
      draft !== null &&
      JSON.stringify(draft) !== JSON.stringify(savedRanks),
    [draft, savedRanks],
  );

  const pendingRank =
    pendingRemoveIndex !== null && ranks
      ? ranks.ladder[pendingRemoveIndex]
      : null;

  function updateLadder(
    index: number,
    field: "name" | "roleId" | "xp",
    value: string,
  ) {
    if (!ranks) return;
    const ladder = ranks.ladder.map((row, i) =>
      i === index
        ? {
            ...row,
            [field]: field === "xp" ? Number(value) || 0 : value,
          }
        : row,
    );
    setDraft({ ...ranks, ladder });
  }

  function handleAddRank(rank: { name: string; roleId: string; xp: number }) {
    if (!ranks) return;
    setDraft({
      ...ranks,
      ladder: [...ranks.ladder, rank],
    });
    setShowAddModal(false);
  }

  function confirmRemove() {
    if (!ranks || pendingRemoveIndex === null) return;
    setDraft({
      ...ranks,
      ladder: ranks.ladder.filter((_, i) => i !== pendingRemoveIndex),
    });
    setPendingRemoveIndex(null);
  }

  async function onSave() {
    if (!ranks) return;
    await save({ ranks });
    setDraft(null);
  }

  if (loading || !ranks) return <p className="muted">Loading…</p>;

  const removeMessage = pendingRank
    ? `Remove rank "${pendingRank.name || pendingRank.roleId}" (${pendingRank.xp} XP)? Changes apply after you save.`
    : "";

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

        <div className="row row-between">
          <button
            type="button"
            className="btn"
            onClick={() => setShowAddModal(true)}
          >
            Add rank
          </button>
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
              {saving ? "Saving…" : "Save ranks"}
            </button>
          </div>
        </div>

        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Name</th>
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
                      className="input"
                      value={row.name ?? ""}
                      onChange={(e) => updateLadder(i, "name", e.target.value)}
                      style={{ width: "100%" }}
                    />
                  </td>
                  <td>
                    <input
                      className="input mono"
                      value={row.roleId}
                      onChange={(e) =>
                        updateLadder(i, "roleId", e.target.value)
                      }
                      style={{ width: "100%" }}
                    />
                  </td>
                  <td>
                    <input
                      className="input"
                      type="number"
                      value={row.xp}
                      onChange={(e) => updateLadder(i, "xp", e.target.value)}
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={() => setPendingRemoveIndex(i)}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <AddRankModal
        open={showAddModal}
        onCancel={() => setShowAddModal(false)}
        onAdd={handleAddRank}
      />

      <ConfirmModal
        open={pendingRemoveIndex !== null}
        title="Remove rank"
        message={removeMessage}
        confirmLabel="Remove"
        variant="danger"
        onConfirm={confirmRemove}
        onCancel={() => setPendingRemoveIndex(null)}
      />
    </>
  );
}
