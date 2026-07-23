"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { SaveActions } from "@/components/SaveActions";
import { useUnsavedChanges } from "@/lib/unsaved-changes";

type Qotd = {
  _id: string;
  guildId: string;
  modOrder: { id: string; tag: string }[];
  currentIndex: number;
  lastReminderDate?: string | null;
  enabled: boolean;
};

type QotdDraft = {
  modOrderText: string;
  enabled: boolean;
  currentIndex: number;
};

function modOrderToText(modOrder: { id: string; tag: string }[]): string {
  return modOrder.map((m) => `${m.id}|${m.tag}`).join("\n");
}

export default function OpsQotdPage() {
  const [item, setItem] = useState<Qotd | null>(null);
  const [saved, setSaved] = useState<QotdDraft | null>(null);
  const [draft, setDraft] = useState<QotdDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const form = draft ?? saved;

  const isDirty = useMemo(
    () => draft !== null && JSON.stringify(draft) !== JSON.stringify(saved),
    [draft, saved],
  );

  async function load() {
    setError(null);
    const res = await fetch("/api/ops/qotd?limit=1");
    if (!res.ok) {
      setError(await res.text());
      return;
    }
    const data = await res.json();
    const doc = data.items?.[0] || null;
    setItem(doc);
    if (doc) {
      const snapshot: QotdDraft = {
        modOrderText: modOrderToText(doc.modOrder || []),
        enabled: doc.enabled,
        currentIndex: doc.currentIndex,
      };
      setSaved(snapshot);
      setDraft(null);
    } else {
      setSaved(null);
      setDraft(null);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function updateDraft(patch: Partial<QotdDraft>) {
    if (!form) return;
    setDraft({ ...form, ...patch });
  }

  function onDiscard() {
    setDraft(null);
  }

  async function onSave() {
    if (!item || !form) return;
    setSaving(true);
    setStatus(null);
    setError(null);
    const modOrder = form.modOrderText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [id, ...tagParts] = line.split("|");
        return { id: id.trim(), tag: tagParts.join("|").trim() || id.trim() };
      });

    const res = await fetch(`/api/ops/qotd/${item._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        modOrder,
        currentIndex: form.currentIndex,
        enabled: form.enabled,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      setError(await res.text());
      return;
    }
    setStatus("Saved");
    await load();
  }

  const { saveBarRef } = useUnsavedChanges({
    isDirty,
    onDiscard,
  });

  return (
    <>
      <PageHeader
        title="QOTD rotation"
        description="Moderator order for question-of-the-day reminders. Format: userId|tag per line."
      />
      <div className="card stack">
        {error ? <p className="status err">{error}</p> : null}
        {status ? <p className="status ok">{status}</p> : null}
        {!item || !form ? (
          <p className="muted">
            No QOTD rotation document yet. Create one from Discord or seed
            manually.
          </p>
        ) : (
          <>
            <label
              style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}
            >
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) => updateDraft({ enabled: e.target.checked })}
              />
              Enabled
            </label>
            <div className="field">
              <label>Current index</label>
              <input
                type="number"
                value={form.currentIndex}
                onChange={(e) =>
                  updateDraft({
                    currentIndex: Number(e.target.value) || 0,
                  })
                }
              />
            </div>
            <div className="field">
              <label>Mod order (userId|tag)</label>
              <textarea
                value={form.modOrderText}
                onChange={(e) => updateDraft({ modOrderText: e.target.value })}
              />
            </div>
            <p className="muted">
              Last reminder date: {item.lastReminderDate || "—"}
            </p>
            <SaveActions
              saveBarRef={saveBarRef}
              isDirty={isDirty}
              saving={saving}
              onSave={onSave}
              onDiscard={onDiscard}
              saveLabel="Save"
            />
          </>
        )}
      </div>
    </>
  );
}
