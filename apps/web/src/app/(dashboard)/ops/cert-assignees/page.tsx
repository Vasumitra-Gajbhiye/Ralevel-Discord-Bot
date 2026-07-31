"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { SaveActions } from "@/components/SaveActions";
import { useUnsavedChanges } from "@/lib/unsaved-changes";

type AssigneeEntry = {
  id: string;
  tag: string;
};

type CertRotation = {
  _id: string;
  guildId: string;
  assignees: AssigneeEntry[];
  currentIndex: number;
  lastReminderDate?: string | null;
  enabled: boolean;
};

type CertRotationDraft = {
  assignees: AssigneeEntry[];
  enabled: boolean;
  currentIndex: number;
};

function snapshotFromDoc(doc: CertRotation): CertRotationDraft {
  return {
    assignees: (doc.assignees || []).map((m) => ({ id: m.id, tag: m.tag })),
    enabled: doc.enabled,
    currentIndex: doc.currentIndex,
  };
}

function draftsEqual(a: CertRotationDraft, b: CertRotationDraft): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export default function OpsCertAssigneesPage() {
  const [item, setItem] = useState<CertRotation | null>(null);
  const [saved, setSaved] = useState<CertRotationDraft | null>(null);
  const [draft, setDraft] = useState<CertRotationDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [addId, setAddId] = useState("");
  const [addTag, setAddTag] = useState("");
  const [addError, setAddError] = useState<string | null>(null);

  const form = draft ?? saved;

  const isDirty = useMemo(
    () => draft !== null && saved !== null && !draftsEqual(draft, saved),
    [draft, saved],
  );

  const upNext = useMemo(() => {
    if (!form || form.assignees.length === 0) return null;
    const idx = form.currentIndex;
    if (idx < 0 || idx >= form.assignees.length) return null;
    return form.assignees[idx];
  }, [form]);

  const indexOutOfRange = useMemo(() => {
    if (!form || form.assignees.length === 0) return form?.currentIndex !== 0;
    return form.currentIndex < 0 || form.currentIndex >= form.assignees.length;
  }, [form]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ops/certRotation?limit=1");
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

  function updateDraft(patch: Partial<CertRotationDraft>) {
    if (!form) return;
    setDraft({ ...form, ...patch });
  }

  function updateAssignee(index: number, patch: Partial<AssigneeEntry>) {
    if (!form) return;
    const assignees = form.assignees.map((m, i) =>
      i === index ? { ...m, ...patch } : m,
    );
    updateDraft({ assignees });
  }

  function moveAssignee(index: number, direction: -1 | 1) {
    if (!form) return;
    const target = index + direction;
    if (target < 0 || target >= form.assignees.length) return;
    const assignees = [...form.assignees];
    const [entry] = assignees.splice(index, 1);
    assignees.splice(target, 0, entry);
    let currentIndex = form.currentIndex;
    if (form.currentIndex === index) {
      currentIndex = target;
    } else if (form.currentIndex === target) {
      currentIndex = index;
    }
    updateDraft({ assignees, currentIndex });
  }

  function removeAssignee(index: number) {
    if (!form) return;
    const assignees = form.assignees.filter((_, i) => i !== index);
    let currentIndex = form.currentIndex;
    if (assignees.length === 0) {
      currentIndex = 0;
    } else if (index < form.currentIndex) {
      currentIndex = Math.max(0, form.currentIndex - 1);
    } else if (form.currentIndex >= assignees.length) {
      currentIndex = assignees.length - 1;
    }
    updateDraft({ assignees, currentIndex });
  }

  function addAssignee() {
    if (!form) return;
    const id = addId.trim();
    if (!id) {
      setAddError("User ID is required.");
      return;
    }
    const tag = addTag.trim() || id;
    updateDraft({
      assignees: [...form.assignees, { id, tag }],
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

  async function onCreate() {
    setCreating(true);
    setError(null);
    try {
      const cfgRes = await fetch("/api/config");
      if (!cfgRes.ok) {
        setError("Could not load guild config for guildId.");
        toast.error("Failed to create rotation");
        return;
      }
      const cfg = await cfgRes.json();
      const guildId = cfg.guildId;
      if (!guildId) {
        setError("Guild ID missing from config.");
        toast.error("Failed to create rotation");
        return;
      }
      const res = await fetch("/api/ops/certRotation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guildId,
          assignees: [],
          currentIndex: 0,
          enabled: true,
        }),
      });
      if (!res.ok) {
        setError(await res.text());
        toast.error("Failed to create rotation");
        return;
      }
      toast.success("Certificate assignee rotation created");
      await load();
    } finally {
      setCreating(false);
    }
  }

  async function onSave() {
    if (!item || !form) return;
    setSaving(true);
    setError(null);
    const assignees = form.assignees.map((m) => ({
      id: m.id.trim(),
      tag: m.tag.trim() || m.id.trim(),
    }));

    const res = await fetch(`/api/ops/certRotation/${item._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assignees,
        currentIndex: form.currentIndex,
        enabled: form.enabled,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const message = await res.text();
      setError(message);
      toast.error("Failed to save assignees");
      return;
    }
    toast.success("Certificate assignees saved");
    await load();
  }

  const { saveBarRef } = useUnsavedChanges({
    isDirty,
    onDiscard,
  });

  return (
    <>
      <PageHeader
        title="Certificate assignees"
        description="Round-robin list of people pinged when a certificate application is submitted, plus day 3/7 reminders."
      />
      <div className="card stack">
        <div className="row">
          <button
            type="button"
            className="btn"
            onClick={load}
            disabled={loading || saving || creating}
          >
            Refresh
          </button>
        </div>
        {error ? <p className="status err">{error}</p> : null}
        {loading ? (
          <p className="muted">Loading…</p>
        ) : !item || !form ? (
          <div className="stack" style={{ gap: "0.75rem" }}>
            <p className="muted" style={{ margin: 0 }}>
              No certificate assignee rotation yet. Create one to start
              round-robin assignment.
            </p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={onCreate}
              disabled={creating}
            >
              {creating ? "Creating…" : "Create rotation"}
            </button>
          </div>
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
                Assign and ping from this list
              </label>

              <div
                className="row"
                style={{ alignItems: "flex-end", flexWrap: "wrap" }}
              >
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
                  {form.assignees.length} assignee
                  {form.assignees.length === 1 ? "" : "s"}
                </p>
              </div>

              <div className="stack" style={{ gap: "0.25rem" }}>
                <p className="muted" style={{ margin: 0 }}>
                  Last reminder run: {item.lastReminderDate || "—"}
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
                    Current index is out of range for the assignee list.
                  </p>
                ) : null}
              </div>
            </div>

            <div className="field">
              <label>Assignees</label>
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
                    {form.assignees.length === 0 ? (
                      <tr>
                        <td colSpan={4}>
                          <span className="muted">No assignees yet.</span>
                        </td>
                      </tr>
                    ) : (
                      form.assignees.map((person, index) => {
                        const isCurrent = index === form.currentIndex;
                        return (
                          <tr
                            key={`${index}-${person.id}`}
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
                                value={person.id}
                                onChange={(e) =>
                                  updateAssignee(index, { id: e.target.value })
                                }
                              />
                            </td>
                            <td>
                              <input
                                value={person.tag}
                                onChange={(e) =>
                                  updateAssignee(index, { tag: e.target.value })
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
                                  onClick={() => moveAssignee(index, -1)}
                                  aria-label="Move up"
                                >
                                  Up
                                </button>
                                <button
                                  type="button"
                                  className="btn"
                                  disabled={index === form.assignees.length - 1}
                                  onClick={() => moveAssignee(index, 1)}
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
                                  onClick={() => removeAssignee(index)}
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

            <div
              className="row"
              style={{ alignItems: "flex-end", flexWrap: "wrap" }}
            >
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
                  placeholder="Display name"
                />
              </div>
              <button
                type="button"
                className="btn btn-primary"
                onClick={addAssignee}
              >
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
