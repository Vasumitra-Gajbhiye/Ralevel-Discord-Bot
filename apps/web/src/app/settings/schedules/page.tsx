"use client";

import { useState } from "react";
import { PageHeader, RestartBanner } from "@/components/PageHeader";
import { useGuildConfig, type GuildConfigData } from "@/lib/useGuildConfig";

export default function SchedulesPage() {
  const { config, loading, error, saving, status, save } = useGuildConfig();
  const [draft, setDraft] = useState<GuildConfigData["schedules"] | null>(null);
  const schedules = draft ?? config?.schedules;

  if (loading || !schedules) return <p className="muted">Loading…</p>;

  return (
    <>
      <PageHeader
        title="Schedules"
        description="Daily finalize and QOTD reminder hours (IST, 0–23)."
      />
      <RestartBanner />
      {error ? <p className="status err">{error}</p> : null}
      {status ? <p className="status ok">{status}</p> : null}
      <div className="card stack">
        <div className="row">
          <div className="field">
            <label>XP finalize hour (IST)</label>
            <input
              type="number"
              min={0}
              max={23}
              value={schedules.finalizeHourIst}
              onChange={(e) =>
                setDraft({
                  ...schedules,
                  finalizeHourIst: Number(e.target.value) || 0,
                })
              }
            />
          </div>
          <div className="field">
            <label>QOTD reminder hour (IST)</label>
            <input
              type="number"
              min={0}
              max={23}
              value={schedules.qotdHourIst}
              onChange={(e) =>
                setDraft({
                  ...schedules,
                  qotdHourIst: Number(e.target.value) || 0,
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
            await save({ schedules });
            setDraft(null);
          }}
        >
          {saving ? "Saving…" : "Save schedules"}
        </button>
      </div>
    </>
  );
}
