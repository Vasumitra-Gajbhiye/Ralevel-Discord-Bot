"use client";

import { useState } from "react";
import { PageHeader, RestartBanner } from "@/components/PageHeader";
import { useGuildConfig, type GuildConfigData } from "@/lib/useGuildConfig";

export default function TasksSettingsPage() {
  const { config, loading, error, saving, status, save } = useGuildConfig();
  const [draft, setDraft] = useState<GuildConfigData["tasks"] | null>(null);
  const tasks = draft ?? config?.tasks;

  if (loading || !tasks) return <p className="muted">Loading…</p>;

  return (
    <>
      <PageHeader
        title="Task teams"
        description="Map team IDs to channel keys and allowed role keys."
      />
      <RestartBanner />
      {error ? <p className="status err">{error}</p> : null}
      {status ? <p className="status ok">{status}</p> : null}
      <div className="stack">
        {tasks.teams.map((team, i) => (
          <div className="card stack" key={i}>
            <div className="row">
              <div className="field">
                <label>Team ID</label>
                <input
                  value={team.id}
                  onChange={(e) => {
                    const teams = [...tasks.teams];
                    teams[i] = { ...team, id: e.target.value };
                    setDraft({ teams });
                  }}
                />
              </div>
              <div className="field">
                <label>Label</label>
                <input
                  value={team.label}
                  onChange={(e) => {
                    const teams = [...tasks.teams];
                    teams[i] = { ...team, label: e.target.value };
                    setDraft({ teams });
                  }}
                />
              </div>
              <div className="field">
                <label>Channel key</label>
                <input
                  value={team.channelKey}
                  onChange={(e) => {
                    const teams = [...tasks.teams];
                    teams[i] = { ...team, channelKey: e.target.value };
                    setDraft({ teams });
                  }}
                />
              </div>
            </div>
            <div className="field">
              <label>Allowed role keys (comma-separated)</label>
              <input
                value={team.allowedRoleKeys.join(", ")}
                onChange={(e) => {
                  const teams = [...tasks.teams];
                  teams[i] = {
                    ...team,
                    allowedRoleKeys: e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  };
                  setDraft({ teams });
                }}
              />
            </div>
          </div>
        ))}
        <button
          type="button"
          className="btn btn-primary"
          disabled={saving}
          onClick={async () => {
            await save({ tasks });
            setDraft(null);
          }}
        >
          {saving ? "Saving…" : "Save task settings"}
        </button>
      </div>
    </>
  );
}
