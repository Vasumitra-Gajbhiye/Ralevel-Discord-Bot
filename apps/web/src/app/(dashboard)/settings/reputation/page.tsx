"use client";

import { useMemo, useState } from "react";
import { ConfirmModal } from "@/components/ConfirmModal";
import { LabeledIdList } from "@/components/LabeledIdList";
import { PageHeader, RestartBanner } from "@/components/PageHeader";
import { RoleSelect } from "@/components/RoleSelect";
import { WordPillList } from "@/components/WordPillList";
import { normalizeIdLabels } from "@/lib/reputationIds";
import { useGuildConfig, type GuildConfigData } from "@/lib/useGuildConfig";

type ReputationConfig = GuildConfigData["reputation"];

function normalizeReputation(rep: ReputationConfig): ReputationConfig {
  return {
    ...rep,
    disabledChannels: normalizeIdLabels(rep.disabledChannels),
    disabledCategories: normalizeIdLabels(rep.disabledCategories),
    staffChannelIds: normalizeIdLabels(rep.staffChannelIds),
  };
}

export default function ReputationSettingsPage() {
  const { config, loading, error, saving, status, save } = useGuildConfig();
  const [draft, setDraft] = useState<ReputationConfig | null>(null);
  const [pendingRemoveTierIndex, setPendingRemoveTierIndex] = useState<
    number | null
  >(null);

  const savedRep = useMemo(
    () => (config?.reputation ? normalizeReputation(config.reputation) : null),
    [config?.reputation],
  );
  const rep = draft ?? savedRep;
  const roles = config?.roles ?? [];

  const isDirty = useMemo(
    () =>
      draft !== null && JSON.stringify(draft) !== JSON.stringify(savedRep),
    [draft, savedRep],
  );

  const pendingTier =
    pendingRemoveTierIndex !== null && rep
      ? rep.tiers[pendingRemoveTierIndex]
      : null;

  function updateRep(patch: Partial<ReputationConfig>) {
    if (!rep) return;
    setDraft({ ...rep, ...patch });
  }

  function confirmRemoveTier() {
    if (!rep || pendingRemoveTierIndex === null) return;
    setDraft({
      ...rep,
      tiers: rep.tiers.filter((_, i) => i !== pendingRemoveTierIndex),
    });
    setPendingRemoveTierIndex(null);
  }

  async function onSave() {
    if (!rep) return;
    await save({ reputation: rep });
    setDraft(null);
  }

  if (loading || !rep) return <p className="muted">Loading…</p>;

  const removeTierMessage = pendingTier
    ? `Remove tier "${pendingTier.label || pendingTier.roleKey}" (${pendingTier.threshold} rep)? Changes apply after you save.`
    : "";

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
                <RoleSelect
                  roles={roles}
                  value={tier.roleKey}
                  excludeKeys={rep.tiers
                    .filter((_, j) => j !== i)
                    .map((t) => t.roleKey)
                    .filter(Boolean)}
                  onChange={(roleKey) => {
                    const tiers = [...rep.tiers];
                    tiers[i] = { ...tier, roleKey };
                    updateRep({ tiers });
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
                    updateRep({ tiers });
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
                    updateRep({ tiers });
                  }}
                />
              </div>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => setPendingRemoveTierIndex(i)}
              >
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn"
            onClick={() =>
              updateRep({
                tiers: [
                  ...rep.tiers,
                  { roleKey: "", threshold: 10, label: "New tier" },
                ],
              })
            }
          >
            Add tier
          </button>
        </div>

        <div className="card stack">
          <h3 style={{ margin: 0, fontSize: "1rem" }}>Detection words</h3>
          <WordPillList
            label="Thank words"
            description="Whole-word matches that trigger thank-you reputation."
            words={rep.thankWords}
            onChange={(thankWords) => updateRep({ thankWords })}
          />
          <WordPillList
            label="Welcome / yw words"
            description="Whole-word matches for welcome / you're welcome replies."
            words={rep.welcomeWords}
            onChange={(welcomeWords) => updateRep({ welcomeWords })}
          />
        </div>

        <div className="card stack">
          <h3 style={{ margin: 0, fontSize: "1rem" }}>
            Channels, categories & staff
          </h3>
          <LabeledIdList
            title="Disabled channels"
            description="Reputation is not awarded in these channels."
            items={rep.disabledChannels}
            onChange={(disabledChannels) => updateRep({ disabledChannels })}
            addButtonLabel="Add channel"
            addModalTitle="Add disabled channel"
            idColumnLabel="Channel ID"
          />
          <LabeledIdList
            title="Disabled categories"
            description="Reputation is not awarded in channels under these category IDs."
            items={rep.disabledCategories}
            onChange={(disabledCategories) => updateRep({ disabledCategories })}
            addButtonLabel="Add category"
            addModalTitle="Add disabled category"
            idColumnLabel="Category ID"
          />
          <LabeledIdList
            title="Staff channels"
            description="Reputation is not awarded in these staff-only channels."
            items={rep.staffChannelIds}
            onChange={(staffChannelIds) => updateRep({ staffChannelIds })}
            addButtonLabel="Add staff channel"
            addModalTitle="Add staff channel"
            idColumnLabel="Channel ID"
          />
        </div>

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
              {saving ? "Saving…" : "Save reputation settings"}
            </button>
          </div>
        </div>
      </div>

      <ConfirmModal
        open={pendingRemoveTierIndex !== null}
        title="Remove tier"
        message={removeTierMessage}
        confirmLabel="Remove"
        variant="danger"
        onConfirm={confirmRemoveTier}
        onCancel={() => setPendingRemoveTierIndex(null)}
      />
    </>
  );
}
