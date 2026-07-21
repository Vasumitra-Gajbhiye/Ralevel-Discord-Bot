"use client";

import { useState } from "react";
import { PageHeader, RestartBanner } from "@/components/PageHeader";
import { FEATURE_KEYS } from "@/lib/nav";
import { useGuildConfig } from "@/lib/useGuildConfig";

export default function FeaturesPage() {
  const { config, loading, error, saving, status, save } = useGuildConfig();
  const [draft, setDraft] = useState<Record<string, boolean> | null>(null);
  const features = draft ?? config?.features ?? {};

  if (loading) return <p className="muted">Loading…</p>;

  return (
    <>
      <PageHeader
        title="Features"
        description="Toggle major bot systems on or off."
      />
      <RestartBanner />
      {error ? <p className="status err">{error}</p> : null}
      {status ? <p className="status ok">{status}</p> : null}
      <div className="card stack">
        <div className="checkbox-grid">
          {FEATURE_KEYS.map(({ key, label }) => (
            <label key={key}>
              <input
                type="checkbox"
                checked={features[key] !== false}
                onChange={(e) =>
                  setDraft({ ...features, [key]: e.target.checked })
                }
              />
              {label}
            </label>
          ))}
        </div>
        <button
          type="button"
          className="btn btn-primary"
          disabled={saving}
          onClick={async () => {
            await save({ features });
            setDraft(null);
          }}
        >
          {saving ? "Saving…" : "Save features"}
        </button>
      </div>
    </>
  );
}
