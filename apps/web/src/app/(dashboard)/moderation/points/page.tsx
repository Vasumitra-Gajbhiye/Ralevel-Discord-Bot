"use client";

import { useMemo, useState } from "react";
import {
  MOD_POINTS_PLACEHOLDERS,
  renderMessageTemplate,
} from "@ralevel/shared";
import type { ModPointsConfig, ModPointSource } from "@ralevel/db";
import { PageHeader } from "@/components/PageHeader";
import { SaveActions } from "@/components/SaveActions";
import { useGuildConfig } from "@/lib/useGuildConfig";
import { useUnsavedChanges } from "@/lib/unsaved-changes";

const SOURCE_FIELDS: { key: ModPointSource; label: string }[] = [
  { key: "warn", label: "/warn" },
  { key: "timeout", label: "/timeout" },
  { key: "kick", label: "/kick" },
  { key: "softban", label: "/softban" },
];

const DELETE_MESSAGE_OPTIONS = [
  { value: "1m", label: "Past 1 minute" },
  { value: "1h", label: "Past 1 hour" },
  { value: "1d", label: "Past 1 day" },
  { value: "7d", label: "Past 7 days" },
];

function toCount(value: string): number {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function validate(points: ModPointsConfig): string[] {
  const errors: string[] = [];
  if (points.threshold < 1) {
    errors.push("Ban threshold must be at least 1.");
  }
  if (points.noticeDistance >= points.threshold) {
    errors.push("Notice distance must be less than the ban threshold.");
  }
  return errors;
}

export default function PointSystemPage() {
  const { config, loading, error, saving, status, save } = useGuildConfig();
  const [draft, setDraft] = useState<ModPointsConfig | null>(null);

  const saved = config?.moderation?.points ?? null;
  const points = draft ?? saved;

  const isDirty = useMemo(
    () => draft !== null && JSON.stringify(draft) !== JSON.stringify(saved),
    [draft, saved],
  );

  const { saveBarRef } = useUnsavedChanges({
    isDirty,
    onDiscard: () => setDraft(null),
  });

  if (loading || !config) return <p className="muted">Loading…</p>;
  if (!points) {
    return (
      <p className="status err">
        Point system settings are missing from the config. Reload the page.
      </p>
    );
  }

  const current = points;
  const validationErrors = validate(current);
  const noticeAt = Math.max(0, current.threshold - current.noticeDistance);

  function update(patch: Partial<ModPointsConfig>) {
    setDraft({ ...current, ...patch });
  }

  async function onSave() {
    if (!config || validationErrors.length > 0) return;
    await save({
      moderation: { ...config.moderation, points: current },
    });
    setDraft(null);
  }

  // Sample values: the user just landed at the notice threshold via a warn.
  const sampleVars = {
    points: noticeAt,
    threshold: current.threshold,
    remaining: current.threshold - noticeAt,
    awarded: current.values.warn,
    action: "warn",
    reason: "Spamming in #general",
    serverName: "r/Alevel",
    userTag: "someone",
    userId: "123456789012345678",
  };
  const previewDm =
    `⚠️ You have been warned in **r/Alevel**.\nReason: **${sampleVars.reason}**` +
    (current.appendToInfractionDms
      ? renderMessageTemplate(current.infractionDmSuffix, sampleVars)
      : "") +
    `\n\n${renderMessageTemplate(current.banNoticeTemplate, sampleVars)}`;

  return (
    <>
      <PageHeader
        title="Point system"
        description="Infractions give users points. Reaching the threshold bans them automatically, and users close to it get a ban notice by DM. Changes apply within about 15 seconds."
      />
      {error ? <p className="status err">{error}</p> : null}
      {status ? <p className="status ok">{status}</p> : null}

      <div className="card stack" style={{ marginBottom: "1.5rem" }}>
        <label style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <input
            type="checkbox"
            checked={current.enabled}
            onChange={(e) => update({ enabled: e.target.checked })}
          />
          <strong>Enable the point system</strong>
        </label>
        <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
          While off, no points are given, no ban notices are sent and nobody is
          auto-banned. Existing points are kept.
        </p>
      </div>

      <div className="card stack" style={{ marginBottom: "1.5rem" }}>
        <h3 style={{ margin: 0, fontSize: "1rem" }}>Threshold</h3>
        <div className="row">
          <div className="field">
            <label>Ban threshold (T)</label>
            <input
              type="number"
              min={1}
              value={current.threshold}
              onChange={(e) => update({ threshold: toCount(e.target.value) })}
            />
          </div>
          <div className="field">
            <label>Ban notice distance (X)</label>
            <input
              type="number"
              min={0}
              value={current.noticeDistance}
              onChange={(e) =>
                update({ noticeDistance: toCount(e.target.value) })
              }
            />
          </div>
          <div className="field">
            <label>Points expire after (days)</label>
            <input
              type="number"
              min={0}
              value={current.expiryDays}
              onChange={(e) => update({ expiryDays: toCount(e.target.value) })}
            />
          </div>
        </div>
        <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
          Auto-ban at <strong>{current.threshold}</strong> points. Ban notice
          sent on every infraction that leaves the user at{" "}
          <strong>
            {noticeAt}–{Math.max(noticeAt, current.threshold - 1)}
          </strong>{" "}
          points.{" "}
          {current.expiryDays > 0
            ? `Each entry stops counting ${current.expiryDays} day(s) after it was given.`
            : "Points never expire (0 days)."}
        </p>
        {validationErrors.map((message) => (
          <p key={message} className="status err" style={{ margin: 0 }}>
            {message}
          </p>
        ))}
      </div>

      <div className="card stack" style={{ marginBottom: "1.5rem" }}>
        <h3 style={{ margin: 0, fontSize: "1rem" }}>Points per command</h3>
        <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
          Set a command to 0 to stop it giving points.
        </p>
        <div className="row">
          {SOURCE_FIELDS.map((field) => (
            <div className="field" key={field.key}>
              <label>{field.label}</label>
              <input
                type="number"
                min={0}
                value={current.values[field.key]}
                onChange={(e) =>
                  update({
                    values: {
                      ...current.values,
                      [field.key]: toCount(e.target.value),
                    },
                  })
                }
              />
            </div>
          ))}
        </div>
      </div>

      <div className="card stack" style={{ marginBottom: "1.5rem" }}>
        <h3 style={{ margin: 0, fontSize: "1rem" }}>Auto-ban</h3>
        <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
          The ban DM uses the templates on the Ban messages page.
        </p>
        <div className="row">
          <label
            style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}
          >
            <input
              type="checkbox"
              checked={current.autoBan.appealable}
              onChange={(e) =>
                update({
                  autoBan: { ...current.autoBan, appealable: e.target.checked },
                })
              }
            />
            Ban is appealable
          </label>
          <div className="field">
            <label>Delete past messages</label>
            <select
              value={current.autoBan.deleteMessages}
              onChange={(e) =>
                update({
                  autoBan: {
                    ...current.autoBan,
                    deleteMessages: e.target.value,
                  },
                })
              }
            >
              {DELETE_MESSAGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="field">
          <label>Auto-ban reason</label>
          <p className="muted" style={{ fontSize: "0.82rem", margin: 0 }}>
            Used as the ban reason, in the ban DM&apos;s {"{reason}"}, and in
            the mod log.
          </p>
          <input
            value={current.autoBan.reasonTemplate}
            onChange={(e) =>
              update({
                autoBan: { ...current.autoBan, reasonTemplate: e.target.value },
              })
            }
          />
        </div>
      </div>

      <div className="card stack">
        <h3 style={{ margin: 0, fontSize: "1rem" }}>Messages</h3>
        <div className="field">
          <label>Ban notice DM</label>
          <p className="muted" style={{ fontSize: "0.82rem", margin: 0 }}>
            Added to the infraction DM when the user ends up at {noticeAt} or
            more points (but below {current.threshold}).
          </p>
          <textarea
            rows={5}
            value={current.banNoticeTemplate}
            onChange={(e) => update({ banNoticeTemplate: e.target.value })}
          />
        </div>

        <label style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
          <input
            type="checkbox"
            checked={current.appendToInfractionDms}
            onChange={(e) =>
              update({ appendToInfractionDms: e.target.checked })
            }
          />
          Show point totals in warn / timeout / kick / softban DMs
        </label>
        <div className="field">
          <label>Point total line</label>
          <textarea
            rows={2}
            value={current.infractionDmSuffix}
            disabled={!current.appendToInfractionDms}
            onChange={(e) => update({ infractionDmSuffix: e.target.value })}
          />
        </div>

        <div className="field">
          <label>Preview (warn that reaches the notice zone)</label>
          <pre
            className="mono"
            style={{ whiteSpace: "pre-wrap", margin: 0, fontSize: "0.85rem" }}
          >
            {previewDm}
          </pre>
        </div>
      </div>

      <SaveActions
        saveBarRef={saveBarRef}
        isDirty={isDirty && validationErrors.length === 0}
        saving={saving}
        onSave={onSave}
        onDiscard={() => setDraft(null)}
        saveLabel="Save point system"
      />

      <div className="card stack" style={{ marginTop: "1.5rem" }}>
        <h2 style={{ margin: 0, fontSize: "1.1rem" }}>Placeholders</h2>
        <p className="muted">
          Use these tokens in the templates above. The bot fills them in when it
          sends the message.
        </p>
        <ul className="stack" style={{ listStyle: "none", padding: 0 }}>
          {MOD_POINTS_PLACEHOLDERS.map((placeholder) => (
            <li key={placeholder.key} className="field">
              <strong>
                <code>{placeholder.label}</code>
              </strong>
              <p className="muted" style={{ fontSize: "0.82rem", margin: 0 }}>
                {placeholder.description}
              </p>
              <p className="muted" style={{ fontSize: "0.82rem", margin: 0 }}>
                Used in: {placeholder.templates.join(", ")}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
