"use client";

import { useMemo, useState } from "react";
import { PageHeader, RestartBanner } from "@/components/PageHeader";
import { useGuildConfig, type GuildConfigData } from "@/lib/useGuildConfig";

export default function WelcomeSettingsPage() {
  const { config, loading, error, saving, status, save } = useGuildConfig();
  const [draft, setDraft] = useState<GuildConfigData["welcome"] | null>(null);
  const savedWelcome = useMemo(() => config?.welcome, [config?.welcome]);
  const welcome = draft ?? savedWelcome;

  const isDirty = useMemo(
    () =>
      draft !== null && JSON.stringify(draft) !== JSON.stringify(savedWelcome),
    [draft, savedWelcome],
  );

  if (loading || !welcome) return <p className="muted">Loading…</p>;

  return (
    <>
      <PageHeader
        title="Welcome"
        description="Embed copy and avatar placement. Use {userId} in the description for the member mention."
      />
      <RestartBanner />
      {error ? <p className="status err">{error}</p> : null}
      {status ? <p className="status ok">{status}</p> : null}
      <div className="card stack">
        <div className="field">
          <label>Title</label>
          <input
            value={welcome.title}
            onChange={(e) => setDraft({ ...welcome, title: e.target.value })}
          />
        </div>
        <div className="field">
          <label>Description</label>
          <textarea
            value={welcome.description}
            onChange={(e) =>
              setDraft({ ...welcome, description: e.target.value })
            }
          />
        </div>
        <div className="row">
          <div className="field">
            <label>Color</label>
            <input
              value={welcome.color}
              onChange={(e) => setDraft({ ...welcome, color: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Avatar size</label>
            <input
              type="number"
              value={welcome.avatarSize}
              onChange={(e) =>
                setDraft({
                  ...welcome,
                  avatarSize: Number(e.target.value) || 0,
                })
              }
            />
          </div>
          <div className="field">
            <label>Avatar X</label>
            <input
              type="number"
              value={welcome.avatarX}
              onChange={(e) =>
                setDraft({ ...welcome, avatarX: Number(e.target.value) || 0 })
              }
            />
          </div>
          <div className="field">
            <label>Avatar Y</label>
            <input
              type="number"
              value={welcome.avatarY}
              onChange={(e) =>
                setDraft({ ...welcome, avatarY: Number(e.target.value) || 0 })
              }
            />
          </div>
        </div>
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
            onClick={async () => {
              await save({ welcome });
              setDraft(null);
            }}
          >
            {saving ? "Saving…" : "Save welcome"}
          </button>
        </div>
      </div>
    </>
  );
}
