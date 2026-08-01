"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ChannelIdPicker } from "@/components/ChannelIdPicker";
import { ConfirmModal } from "@/components/ConfirmModal";
import { PageHeader } from "@/components/PageHeader";
import { useGuildConfig } from "@/lib/useGuildConfig";
import type { IdLabel } from "@/lib/reputationIds";

type ExamSession = {
  _id: string;
  name: string;
  amStartUtc: string;
  amEndUtc: string;
  pmStartUtc: string;
  pmEndUtc: string;
  status: "active" | "archived";
  createdAt?: string;
};

type ExamPaper = {
  _id: string;
  sessionId: string;
  label: string;
  date: string;
  slot: "AM" | "PM";
  channelIds: string[];
  lockAt: string;
  unlockAt: string;
  status: "scheduled" | "locked" | "unlocked" | "cancelled";
  forceUnlock?: boolean;
  cancelAfterUnlock?: boolean;
};

const EMPTY_SESSION_FORM = {
  name: "",
  amStartUtc: "07:00",
  amEndUtc: "12:00",
  pmStartUtc: "12:00",
  pmEndUtc: "18:00",
};

function formatUtc(value?: string): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC");
}

async function readError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    if (data?.error && typeof data.error === "string") return data.error;
  } catch {
    // ignore
  }
  return res.statusText || "Request failed";
}

export default function OpsExamLockingPage() {
  const { config } = useGuildConfig();
  const channelOptions = useMemo(
    () =>
      (config?.channels ?? []).map((c) => ({
        key: c.key,
        label: c.label || c.key,
        channelId: c.channelId,
      })),
    [config?.channels],
  );

  const [sessions, setSessions] = useState<ExamSession[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [session, setSession] = useState<ExamSession | null>(null);
  const [papers, setPapers] = useState<ExamPaper[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [createForm, setCreateForm] = useState(EMPTY_SESSION_FORM);
  const [editForm, setEditForm] = useState(EMPTY_SESSION_FORM);
  const [creating, setCreating] = useState(false);
  const [savingSession, setSavingSession] = useState(false);

  const [paperLabel, setPaperLabel] = useState("");
  const [paperDate, setPaperDate] = useState("");
  const [paperSlot, setPaperSlot] = useState<"AM" | "PM">("AM");
  const [paperChannels, setPaperChannels] = useState<IdLabel[]>([]);
  const [rawChannelId, setRawChannelId] = useState("");
  const [addingPaper, setAddingPaper] = useState(false);

  const [confirmDeleteSession, setConfirmDeleteSession] = useState(false);
  const [pendingPaperAction, setPendingPaperAction] = useState<{
    paperId: string;
    action: "cancel" | "force-unlock" | "delete";
    label: string;
  } | null>(null);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/exam-sessions");
      if (!res.ok) throw new Error(await readError(res));
      const data = await res.json();
      setSessions((data.sessions || []) as ExamSession[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load sessions");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSessionDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/exam-sessions/${id}`);
      if (!res.ok) throw new Error(await readError(res));
      const data = await res.json();
      const s = data.session as ExamSession;
      setSession(s);
      setPapers((data.papers || []) as ExamPaper[]);
      setEditForm({
        name: s.name,
        amStartUtc: s.amStartUtc,
        amEndUtc: s.amEndUtc,
        pmStartUtc: s.pmStartUtc,
        pmEndUtc: s.pmEndUtc,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load session");
      setSession(null);
      setPapers([]);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    if (!selectedId) {
      setSession(null);
      setPapers([]);
      return;
    }
    void loadSessionDetail(selectedId);
  }, [selectedId, loadSessionDetail]);

  async function createSession() {
    setCreating(true);
    try {
      const res = await fetch("/api/exam-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createForm),
      });
      if (!res.ok) throw new Error(await readError(res));
      const data = await res.json();
      toast.success("Exam session created");
      setCreateForm(EMPTY_SESSION_FORM);
      await loadSessions();
      setSelectedId(data.session._id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create session");
    } finally {
      setCreating(false);
    }
  }

  async function saveSession() {
    if (!selectedId) return;
    setSavingSession(true);
    try {
      const res = await fetch(`/api/exam-sessions/${selectedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      if (!res.ok) throw new Error(await readError(res));
      toast.success("Session saved");
      await loadSessions();
      await loadSessionDetail(selectedId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save session");
    } finally {
      setSavingSession(false);
    }
  }

  async function archiveSession(status: "active" | "archived") {
    if (!selectedId) return;
    try {
      const res = await fetch(`/api/exam-sessions/${selectedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error(await readError(res));
      toast.success(status === "archived" ? "Session archived" : "Session restored");
      await loadSessions();
      await loadSessionDetail(selectedId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update status");
    }
  }

  async function deleteSession() {
    if (!selectedId) return;
    try {
      const res = await fetch(`/api/exam-sessions/${selectedId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(await readError(res));
      toast.success("Session deleted");
      setSelectedId(null);
      setConfirmDeleteSession(false);
      await loadSessions();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete session");
    }
  }

  function addRawChannelId() {
    const id = rawChannelId.trim();
    if (!/^\d{17,20}$/.test(id)) {
      toast.error("Enter a valid Discord channel snowflake");
      return;
    }
    if (paperChannels.some((c) => c.id === id)) {
      toast.error("Channel already added");
      return;
    }
    const known = channelOptions.find((c) => c.channelId === id);
    setPaperChannels([
      ...paperChannels,
      { id, label: known?.label || id },
    ]);
    setRawChannelId("");
  }

  async function addPaper() {
    if (!selectedId) return;
    if (!paperLabel.trim() || !paperDate || paperChannels.length === 0) {
      toast.error("Label, date, and at least one channel are required");
      return;
    }
    setAddingPaper(true);
    try {
      const res = await fetch(`/api/exam-sessions/${selectedId}/papers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: paperLabel.trim(),
          date: paperDate,
          slot: paperSlot,
          channelIds: paperChannels.map((c) => c.id),
        }),
      });
      if (!res.ok) throw new Error(await readError(res));
      toast.success("Paper added");
      setPaperLabel("");
      setPaperDate("");
      setPaperSlot("AM");
      setPaperChannels([]);
      await loadSessionDetail(selectedId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add paper");
    } finally {
      setAddingPaper(false);
    }
  }

  async function runPaperAction() {
    if (!selectedId || !pendingPaperAction) return;
    const { paperId, action } = pendingPaperAction;
    try {
      if (action === "delete") {
        const res = await fetch(
          `/api/exam-sessions/${selectedId}/papers/${paperId}`,
          { method: "DELETE" },
        );
        if (!res.ok) throw new Error(await readError(res));
        toast.success("Paper deleted");
      } else {
        const res = await fetch(
          `/api/exam-sessions/${selectedId}/papers/${paperId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action }),
          },
        );
        if (!res.ok) throw new Error(await readError(res));
        toast.success(
          action === "cancel"
            ? "Paper cancelled (unlock queued if locked)"
            : "Force unlock queued — bot will unlock shortly",
        );
      }
      setPendingPaperAction(null);
      await loadSessionDetail(selectedId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    }
  }

  return (
    <>
      <PageHeader
        title="Exam locking"
        description="Schedule Cambridge exam sessions. Channels lock at AM/PM start (UTC) and unlock at end — ordinary members cannot send messages while locked."
      />

      <div className="stack" style={{ gap: "1.25rem" }}>
        {error ? <p className="status err">{error}</p> : null}

        <div className="card stack">
          <h3>Create session</h3>
          <div className="row" style={{ flexWrap: "wrap", gap: "0.75rem" }}>
            <div className="field" style={{ minWidth: "12rem", flex: 1 }}>
              <label>Name</label>
              <input
                value={createForm.name}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, name: e.target.value }))
                }
                placeholder="May/June 2026"
              />
            </div>
            <div className="field">
              <label>AM start (UTC)</label>
              <input
                type="time"
                value={createForm.amStartUtc}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, amStartUtc: e.target.value }))
                }
              />
            </div>
            <div className="field">
              <label>AM end (UTC)</label>
              <input
                type="time"
                value={createForm.amEndUtc}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, amEndUtc: e.target.value }))
                }
              />
            </div>
            <div className="field">
              <label>PM start (UTC)</label>
              <input
                type="time"
                value={createForm.pmStartUtc}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, pmStartUtc: e.target.value }))
                }
              />
            </div>
            <div className="field">
              <label>PM end (UTC)</label>
              <input
                type="time"
                value={createForm.pmEndUtc}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, pmEndUtc: e.target.value }))
                }
              />
            </div>
          </div>
          <div className="row">
            <button
              type="button"
              className="btn btn-primary"
              disabled={creating || !createForm.name.trim()}
              onClick={() => void createSession()}
            >
              {creating ? "Creating…" : "Create session"}
            </button>
            <button type="button" className="btn" onClick={() => void loadSessions()}>
              Refresh
            </button>
          </div>
        </div>

        <div className="card stack">
          <h3>Sessions</h3>
          <p className="muted">
            {loading ? "Loading…" : `${sessions.length} session(s)`}
          </p>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>AM (UTC)</th>
                  <th>PM (UTC)</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr
                    key={s._id}
                    style={
                      selectedId === s._id
                        ? { background: "var(--row-hover, transparent)" }
                        : undefined
                    }
                  >
                    <td>{s.name}</td>
                    <td className="mono muted">
                      {s.amStartUtc}–{s.amEndUtc}
                    </td>
                    <td className="mono muted">
                      {s.pmStartUtc}–{s.pmEndUtc}
                    </td>
                    <td>{s.status}</td>
                    <td>
                      <button
                        type="button"
                        className="btn"
                        onClick={() =>
                          setSelectedId(selectedId === s._id ? null : s._id)
                        }
                      >
                        {selectedId === s._id ? "Close" : "Open"}
                      </button>
                    </td>
                  </tr>
                ))}
                {!loading && sessions.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="muted">
                      No exam sessions yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        {selectedId ? (
          <div className="card stack">
            <h3>
              {session?.name ?? "Session"}
              {detailLoading ? (
                <span className="muted"> — Loading…</span>
              ) : null}
            </h3>

            {session ? (
              <>
                <div className="row" style={{ flexWrap: "wrap", gap: "0.75rem" }}>
                  <div className="field" style={{ minWidth: "12rem", flex: 1 }}>
                    <label>Name</label>
                    <input
                      value={editForm.name}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, name: e.target.value }))
                      }
                    />
                  </div>
                  <div className="field">
                    <label>AM start (UTC)</label>
                    <input
                      type="time"
                      value={editForm.amStartUtc}
                      onChange={(e) =>
                        setEditForm((f) => ({
                          ...f,
                          amStartUtc: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="field">
                    <label>AM end (UTC)</label>
                    <input
                      type="time"
                      value={editForm.amEndUtc}
                      onChange={(e) =>
                        setEditForm((f) => ({
                          ...f,
                          amEndUtc: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="field">
                    <label>PM start (UTC)</label>
                    <input
                      type="time"
                      value={editForm.pmStartUtc}
                      onChange={(e) =>
                        setEditForm((f) => ({
                          ...f,
                          pmStartUtc: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="field">
                    <label>PM end (UTC)</label>
                    <input
                      type="time"
                      value={editForm.pmEndUtc}
                      onChange={(e) =>
                        setEditForm((f) => ({
                          ...f,
                          pmEndUtc: e.target.value,
                        }))
                      }
                    />
                  </div>
                </div>
                <div className="row" style={{ flexWrap: "wrap", gap: "0.5rem" }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={savingSession}
                    onClick={() => void saveSession()}
                  >
                    {savingSession ? "Saving…" : "Save session"}
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() =>
                      void archiveSession(
                        session.status === "archived" ? "active" : "archived",
                      )
                    }
                  >
                    {session.status === "archived" ? "Restore" : "Archive"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() => setConfirmDeleteSession(true)}
                  >
                    Delete session
                  </button>
                </div>
                <p className="muted">
                  Changing AM/PM times recomputes lock/unlock for scheduled
                  papers only.
                </p>

                <h4>Add paper</h4>
                <div className="row" style={{ flexWrap: "wrap", gap: "0.75rem" }}>
                  <div className="field" style={{ minWidth: "10rem", flex: 1 }}>
                    <label>Label</label>
                    <input
                      value={paperLabel}
                      onChange={(e) => setPaperLabel(e.target.value)}
                      placeholder="Maths P1"
                    />
                  </div>
                  <div className="field">
                    <label>Date</label>
                    <input
                      type="date"
                      value={paperDate}
                      onChange={(e) => setPaperDate(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label>Slot</label>
                    <select
                      value={paperSlot}
                      onChange={(e) =>
                        setPaperSlot(e.target.value as "AM" | "PM")
                      }
                    >
                      <option value="AM">AM</option>
                      <option value="PM">PM</option>
                    </select>
                  </div>
                </div>
                <div className="field">
                  <label>Channels</label>
                  <ChannelIdPicker
                    channels={channelOptions}
                    selected={paperChannels}
                    onChange={setPaperChannels}
                  />
                </div>
                <div className="row" style={{ alignItems: "end", gap: "0.5rem" }}>
                  <div className="field" style={{ flex: 1 }}>
                    <label>Or paste Discord channel ID</label>
                    <input
                      value={rawChannelId}
                      onChange={(e) => setRawChannelId(e.target.value)}
                      placeholder="123456789012345678"
                      className="mono"
                    />
                  </div>
                  <button
                    type="button"
                    className="btn"
                    onClick={addRawChannelId}
                  >
                    Add ID
                  </button>
                </div>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={addingPaper}
                  onClick={() => void addPaper()}
                >
                  {addingPaper ? "Adding…" : "Add paper"}
                </button>

                <h4>Papers ({papers.length})</h4>
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Label</th>
                        <th>Date</th>
                        <th>Slot</th>
                        <th>Channels</th>
                        <th>Lock / Unlock (UTC)</th>
                        <th>Status</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {papers.map((p) => (
                        <tr key={p._id}>
                          <td>{p.label}</td>
                          <td className="mono">{p.date}</td>
                          <td>{p.slot}</td>
                          <td className="mono muted" style={{ maxWidth: "14rem" }}>
                            {p.channelIds.map((id) => (
                              <div key={id}>{id}</div>
                            ))}
                          </td>
                          <td className="mono muted">
                            <div>{formatUtc(p.lockAt)}</div>
                            <div>{formatUtc(p.unlockAt)}</div>
                          </td>
                          <td>
                            {p.status}
                            {p.forceUnlock ? (
                              <span className="muted"> (unlock queued)</span>
                            ) : null}
                          </td>
                          <td>
                            <div
                              className="row"
                              style={{ gap: "0.35rem", flexWrap: "wrap" }}
                            >
                              {p.status === "scheduled" ||
                              p.status === "locked" ? (
                                <button
                                  type="button"
                                  className="btn"
                                  onClick={() =>
                                    setPendingPaperAction({
                                      paperId: p._id,
                                      action: "cancel",
                                      label: p.label,
                                    })
                                  }
                                >
                                  Cancel
                                </button>
                              ) : null}
                              {p.status === "locked" ? (
                                <button
                                  type="button"
                                  className="btn"
                                  onClick={() =>
                                    setPendingPaperAction({
                                      paperId: p._id,
                                      action: "force-unlock",
                                      label: p.label,
                                    })
                                  }
                                >
                                  Force unlock
                                </button>
                              ) : null}
                              {p.status !== "locked" ? (
                                <button
                                  type="button"
                                  className="btn btn-danger"
                                  onClick={() =>
                                    setPendingPaperAction({
                                      paperId: p._id,
                                      action: "delete",
                                      label: p.label,
                                    })
                                  }
                                >
                                  Delete
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ))}
                      {papers.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="muted">
                            No papers yet. Add exams date-wise above.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      <ConfirmModal
        open={confirmDeleteSession}
        title="Delete session?"
        message="This permanently deletes the session and all non-locked papers. Locked papers must be unlocked first."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => void deleteSession()}
        onCancel={() => setConfirmDeleteSession(false)}
      />

      <ConfirmModal
        open={pendingPaperAction !== null}
        title={
          pendingPaperAction?.action === "delete"
            ? "Delete paper?"
            : pendingPaperAction?.action === "force-unlock"
              ? "Force unlock?"
              : "Cancel paper?"
        }
        message={
          pendingPaperAction?.action === "delete"
            ? `Delete “${pendingPaperAction.label}”?`
            : pendingPaperAction?.action === "force-unlock"
              ? `Queue force unlock for “${pendingPaperAction?.label}”? The bot will unlock channels shortly.`
              : `Cancel “${pendingPaperAction?.label}”? If currently locked, channels will unlock first.`
        }
        confirmLabel={
          pendingPaperAction?.action === "delete" ? "Delete" : "Confirm"
        }
        variant={
          pendingPaperAction?.action === "delete" ? "danger" : "default"
        }
        onConfirm={() => void runPaperAction()}
        onCancel={() => setPendingPaperAction(null)}
      />
    </>
  );
}
