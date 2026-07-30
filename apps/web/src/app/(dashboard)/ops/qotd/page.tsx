"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { SaveActions } from "@/components/SaveActions";
import { useUnsavedChanges } from "@/lib/unsaved-changes";

type ModEntry = {
  id: string;
  tag: string;
};

type Qotd = {
  _id: string;
  guildId: string;
  modOrder: ModEntry[];
  currentIndex: number;
  lastReminderDate?: string | null;
  enabled: boolean;
};

type QotdDraft = {
  modOrder: ModEntry[];
  enabled: boolean;
  currentIndex: number;
};

function snapshotFromDoc(doc: Qotd): QotdDraft {
  return {
    modOrder: (doc.modOrder || []).map((m) => ({ id: m.id, tag: m.tag })),
    enabled: doc.enabled,
    currentIndex: doc.currentIndex,
  };
}

function draftsEqual(a: QotdDraft, b: QotdDraft): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export default function OpsQotdPage() {
  const [item, setItem] = useState<Qotd | null>(null);
  const [saved, setSaved] = useState<QotdDraft | null>(null);
  const [draft, setDraft] = useState<QotdDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [addId, setAddId] = useState("");
  const [addTag, setAddTag] = useState("");
  const [addError, setAddError] = useState<string | null>(null);

  const form = draft ?? saved;

  const isDirty = useMemo(
    () => draft !== null && saved !== null && !draftsEqual(draft, saved),
    [draft, saved],
  );

  const upNext = useMemo(() => {
    if (!form || form.modOrder.length === 0) return null;
    const idx = form.currentIndex;
    if (idx < 0 || idx >= form.modOrder.length) return null;
    return form.modOrder[idx];
  }, [form]);

  const indexOutOfRange = useMemo(() => {
    if (!form || form.modOrder.length === 0) return form?.currentIndex !== 0;
    return form.currentIndex < 0 || form.currentIndex >= form.modOrder.length;
  }, [form]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ops/qotd?limit=1");
      if (!res.ok) {
        setError(await res.text());
        setItem(null);
        setSaved(null);
        setDraft(null);
        return;
      }
      const data = await res.json();
      const doc = data.items?.[0] || null;
      setItem(doc);
      if (doc) {
        setSaved(snapshotFromDoc(doc));
        setDraft(null);
      } else {
        setSaved(null);
        setDraft(null);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function updateDraft(patch: Partial<QotdDraft>) {
    if (!form) return;
    setDraft({ ...form, ...patch });
  }

  function updateMod(index: number, patch: Partial<ModEntry>) {
    if (!form) return;
    const modOrder = form.modOrder.map((m, i) =>
      i === index ? { ...m, ...patch } : m,
    );
    updateDraft({ modOrder });
  }

  function moveMod(index: number, direction: -1 | 1) {
    if (!form) return;
    const target = index + direction;
    if (target < 0 || target >= form.modOrder.length) return;
    const modOrder = [...form.modOrder];
    const [entry] = modOrder.splice(index, 1);
    modOrder.splice(target, 0, entry);
    let currentIndex = form.currentIndex;
    if (form.currentIndex === index) {
      currentIndex = target;
    } else if (form.currentIndex === target) {
      currentIndex = index;
    }
    updateDraft({ modOrder, currentIndex });
  }

  function removeMod(index: number) {
    if (!form) return;
    const modOrder = form.modOrder.filter((_, i) => i !== index);
    let currentIndex = form.currentIndex;
    if (modOrder.length === 0) {
      currentIndex = 0;
    } else if (index < form.currentIndex) {
      currentIndex = Math.max(0, form.currentIndex - 1);
    } else if (form.currentIndex >= modOrder.length) {
      currentIndex = modOrder.length - 1;
    }
    updateDraft({ modOrder, currentIndex });
  }

  function addMod() {
    if (!form) return;
    const id = addId.trim();
    if (!id) {
      setAddError("User ID is required.");
      return;
    }
    const tag = addTag.trim() || id;
    updateDraft({
      modOrder: [...form.modOrder, { id, tag }],
    });
    setAddId("");
    setAddTag("");
    setAddError(null);
  }

  function onDiscard() {
    setDraft(null);
    setAddId("");
    setAddTag("");
    setAddError(null);
  }

  async function onSave() {
    if (!item || !form) return;
    setSaving(true);
    setError(null);
    const modOrder = form.modOrder.map((m) => ({
      id: m.id.trim(),
      tag: m.tag.trim() || m.id.trim(),
    }));

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
      const message = await res.text();
      setError(message);
      toast.error("Failed to save rotation");
      return;
    }
    toast.success("QOTD & SOTD rotation saved");
    await load();
  }

  const { saveBarRef } = useUnsavedChanges({
    isDirty,
    onDiscard,
  });

  return (
    <>
      <PageHeader
        title="QOTD & SOTD"
        description="Moderator rotation for daily question and statement reminders."
      />
      <div className="card stack">
        <div className="row">
          <button
            type="button"
            className="btn"
            onClick={load}
            disabled={loading || saving}
          >
            Refresh
          </button>
        </div>
        {error ? <p className="status err">{error}</p> : null}
        {loading ? (
          <p className="muted">Loading…</p>
        ) : !item || !form ? (
          <p className="muted">
            No QOTD & SOTD rotation document yet. Create one from Discord or seed
            manually.
          </p>
        ) : (
          <>
            <div className="stack" style={{ gap: "0.75rem" }}>
              <label
                style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}
              >
                <input
                  type="checkbox"
                  checked={form.enabled}
                  onChange={(e) => updateDraft({ enabled: e.target.checked })}
                />
                Send daily reminders
              </label>

              <div className="row" style={{ alignItems: "flex-end", flexWrap: "wrap" }}>
                <div className="field" style={{ maxWidth: "8rem" }}>
                  <label>Current index</label>
                  <input
                    type="number"
                    min={0}
                    value={form.currentIndex}
                    onChange={(e) =>
                      updateDraft({
                        currentIndex: Number(e.target.value) || 0,
                      })
                    }
                  />
                </div>
                <p className="muted" style={{ margin: 0 }}>
                  {form.modOrder.length} moderator
                  {form.modOrder.length === 1 ? "" : "s"}
                </p>
              </div>

              <div className="stack" style={{ gap: "0.25rem" }}>
                <p className="muted" style={{ margin: 0 }}>
                  Last reminder: {item.lastReminderDate || "—"}
                </p>
                <p className="muted" style={{ margin: 0 }}>
                  Up next:{" "}
                  {upNext ? (
                    <>
                      <span>{upNext.tag}</span>{" "}
                      <span className="mono">({upNext.id})</span>
                    </>
                  ) : (
                    "—"
                  )}
                </p>
                {indexOutOfRange ? (
                  <p className="status err" style={{ margin: 0 }}>
                    Current index is out of range for the mod list.
                  </p>
                ) : null}
              </div>
            </div>

            <div className="field">
              <label>Mod order</label>
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th style={{ width: "3rem" }}>#</th>
                      <th>User ID</th>
                      <th>Tag</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {form.modOrder.length === 0 ? (
                      <tr>
                        <td colSpan={4}>
                          <span className="muted">No moderators yet.</span>
                        </td>
                      </tr>
                    ) : (
                      form.modOrder.map((mod, index) => {
                        const isCurrent = index === form.currentIndex;
                        return (
                          <tr
                            key={`${index}-${mod.id}`}
                            style={
                              isCurrent
                                ? {
                                    background:
                                      "color-mix(in srgb, var(--accent) 12%, transparent)",
                                  }
                                : undefined
                            }
                          >
                            <td className="mono">{index}</td>
                            <td>
                              <input
                                className="mono"
                                value={mod.id}
                                onChange={(e) =>
                                  updateMod(index, { id: e.target.value })
                                }
                              />
                            </td>
                            <td>
                              <input
                                value={mod.tag}
                                onChange={(e) =>
                                  updateMod(index, { tag: e.target.value })
                                }
                              />
                            </td>
                            <td>
                              <div
                                className="row"
                                style={{ gap: "0.35rem", flexWrap: "wrap" }}
                              >
                                <button
                                  type="button"
                                  className="btn"
                                  disabled={index === 0}
                                  onClick={() => moveMod(index, -1)}
                                  aria-label="Move up"
                                >
                                  Up
                                </button>
                                <button
                                  type="button"
                                  className="btn"
                                  disabled={index === form.modOrder.length - 1}
                                  onClick={() => moveMod(index, 1)}
                                  aria-label="Move down"
                                >
                                  Down
                                </button>
                                <button
                                  type="button"
                                  className={`btn${isCurrent ? " btn-primary" : ""}`}
                                  disabled={isCurrent}
                                  onClick={() =>
                                    updateDraft({ currentIndex: index })
                                  }
                                >
                                  {isCurrent ? "Current" : "Set current"}
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-danger"
                                  onClick={() => removeMod(index)}
                                >
                                  Remove
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="row" style={{ alignItems: "flex-end", flexWrap: "wrap" }}>
              <div className="field">
                <label>User ID</label>
                <input
                  className="mono"
                  value={addId}
                  onChange={(e) => {
                    setAddId(e.target.value);
                    setAddError(null);
                  }}
                  placeholder="Discord user ID"
                />
              </div>
              <div className="field">
                <label>Tag</label>
                <input
                  value={addTag}
                  onChange={(e) => {
                    setAddTag(e.target.value);
                    setAddError(null);
                  }}
                  placeholder="Display tag"
                />
              </div>
              <button type="button" className="btn btn-primary" onClick={addMod}>
                Add
              </button>
            </div>
            {addError ? <p className="status err">{addError}</p> : null}

            <SaveActions
              saveBarRef={saveBarRef}
              isDirty={isDirty}
              saving={saving}
              onSave={onSave}
              onDiscard={onDiscard}
              saveLabel="Save"
              sticky
            />
          </>
        )}
      </div>
    </>
  );
}
