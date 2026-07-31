"use client";

import { useMemo, useState } from "react";
import { InfoHelpIcon } from "@/components/InfoHelpIcon";
import { PageHeader, RestartBanner } from "@/components/PageHeader";
import { SaveActions } from "@/components/SaveActions";
import { useGuildConfig, type GuildConfigData } from "@/lib/useGuildConfig";
import { isDraftDirty, useUnsavedChanges } from "@/lib/unsaved-changes";

const FINALIZE_HOUR_HELP =
  "The hour (IST, 24-hour clock) when daily XP is finalized and level-up messages are sent.";
const QOTD_HOUR_HELP =
  "The hour (IST, 24-hour clock) when the Question of the Day reminder is sent.";
const CERT_HOUR_HELP =
  "The hour (IST, 24-hour clock) when undelivered certificate reminders are sent (day 3/7 assignee pings, day 10+ admin role escalations).";

export default function SchedulesPage() {
  const { config, loading, error, saving, status, save } = useGuildConfig();
  const [draft, setDraft] = useState<GuildConfigData["schedules"] | null>(null);

  const savedSchedules = useMemo(
    () =>
      config?.schedules
        ? {
            ...config.schedules,
            certificatesHourIst: config.schedules.certificatesHourIst ?? 6,
          }
        : undefined,
    [config?.schedules],
  );
  const schedules = draft ?? savedSchedules;

  const isDirty = useMemo(
    () => isDraftDirty(draft, savedSchedules),
    [draft, savedSchedules],
  );

  async function onSave() {
    if (!schedules) return;
    await save({ schedules });
    setDraft(null);
  }

  const { saveBarRef } = useUnsavedChanges({
    isDirty,
    onDiscard: () => setDraft(null),
  });

  if (loading || !schedules) return <p className="muted">Loading…</p>;

  return (
    <>
      <PageHeader
        title="Schedules"
        description="Daily finalize, QOTD, and certificate reminder hours (IST, 0–23)."
      />
      <RestartBanner />
      {error ? <p className="status err">{error}</p> : null}
      {status ? <p className="status ok">{status}</p> : null}
      <div className="card stack">
        <div className="row">
          <div className="field">
            <label className="label-with-help">
              XP finalize hour (IST)
              <InfoHelpIcon content={FINALIZE_HOUR_HELP} />
            </label>
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
            <label className="label-with-help">
              QOTD reminder hour (IST)
              <InfoHelpIcon content={QOTD_HOUR_HELP} />
            </label>
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
          <div className="field">
            <label className="label-with-help">
              Certificate reminder hour (IST)
              <InfoHelpIcon content={CERT_HOUR_HELP} />
            </label>
            <input
              type="number"
              min={0}
              max={23}
              value={schedules.certificatesHourIst}
              onChange={(e) =>
                setDraft({
                  ...schedules,
                  certificatesHourIst: Number(e.target.value) || 0,
                })
              }
            />
          </div>
        </div>
        <SaveActions
          saveBarRef={saveBarRef}
          isDirty={isDirty}
          saving={saving}
          onSave={onSave}
          onDiscard={() => setDraft(null)}
          saveLabel="Save schedules"
        />
      </div>
    </>
  );
}
