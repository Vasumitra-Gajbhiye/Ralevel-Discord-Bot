"use client";

import { useState } from "react";
import { PageHeader, RestartBanner } from "@/components/PageHeader";
import { useGuildConfig, type GuildConfigData } from "@/lib/useGuildConfig";

export default function CertificatesSettingsPage() {
  const { config, loading, error, saving, status, save } = useGuildConfig();
  const [draft, setDraft] = useState<GuildConfigData["certificates"] | null>(
    null,
  );
  const certs = draft ?? config?.certificates;
  const roleKeys = config?.roles.map((r) => r.key) ?? [];

  if (loading || !certs) return <p className="muted">Loading…</p>;

  return (
    <>
      <PageHeader
        title="Certificate settings"
        description="Certificate types, eligibility role keys, and staff mod roles."
      />
      <RestartBanner />
      {error ? <p className="status err">{error}</p> : null}
      {status ? <p className="status ok">{status}</p> : null}

      <div className="stack">
        {certs.types.map((type, i) => (
          <div className="card stack" key={type.id}>
            <div className="row">
              <div className="field">
                <label>ID</label>
                <input
                  value={type.id}
                  onChange={(e) => {
                    const types = [...certs.types];
                    types[i] = { ...type, id: e.target.value };
                    setDraft({ ...certs, types });
                  }}
                />
              </div>
              <div className="field">
                <label>Label</label>
                <input
                  value={type.label}
                  onChange={(e) => {
                    const types = [...certs.types];
                    types[i] = { ...type, label: e.target.value };
                    setDraft({ ...certs, types });
                  }}
                />
              </div>
              <label style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={type.enabled}
                  onChange={(e) => {
                    const types = [...certs.types];
                    types[i] = { ...type, enabled: e.target.checked };
                    setDraft({ ...certs, types });
                  }}
                />
                Enabled
              </label>
            </div>
            <div className="field">
              <label>Required role keys (comma-separated)</label>
              <input
                value={type.requiredRoleKeys.join(", ")}
                onChange={(e) => {
                  const types = [...certs.types];
                  types[i] = {
                    ...type,
                    requiredRoleKeys: e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  };
                  setDraft({ ...certs, types });
                }}
              />
            </div>
            <div className="field">
              <label>Reward role key</label>
              <select
                value={type.rewardRoleKey || ""}
                onChange={(e) => {
                  const types = [...certs.types];
                  types[i] = {
                    ...type,
                    rewardRoleKey: e.target.value || null,
                  };
                  setDraft({ ...certs, types });
                }}
              >
                <option value="">None</option>
                {roleKeys.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ))}

        <div className="card stack">
          <div className="field">
            <label>Mod role keys (comma-separated)</label>
            <input
              value={certs.modRoleKeys.join(", ")}
              onChange={(e) =>
                setDraft({
                  ...certs,
                  modRoleKeys: e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
            />
          </div>
          <div className="field">
            <label>Extra mod role IDs (legacy MOD_ROLES)</label>
            <input
              className="mono"
              value={(certs.extraModRoleIds || []).join(", ")}
              onChange={(e) =>
                setDraft({
                  ...certs,
                  extraModRoleIds: e.target.value
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
            await save({ certificates: certs });
            setDraft(null);
          }}
        >
          {saving ? "Saving…" : "Save certificate settings"}
        </button>
      </div>
    </>
  );
}
