"use client";

import { useState } from "react";
import { ConfirmModal } from "@/components/ConfirmModal";
import { PageHeader } from "@/components/PageHeader";
import { Pagination } from "@/components/Pagination";
import { useOpsCollection } from "@/lib/useOpsCollection";

type Note = {
  _id: string;
  userId?: string;
  userTag?: string;
  moderatorTag?: string;
  note?: string;
  content?: string;
  reason?: string;
  createdAt?: string;
  timestamp?: string;
};

function noteText(note: Note) {
  return note.note || note.content || note.reason || "";
}

export default function NotesPage() {
  const {
    items,
    total,
    loading,
    error,
    q,
    setQ,
    page,
    setPage,
    pageSize,
    load,
    remove,
  } = useOpsCollection<Note>("notes", { pageSize: 15 });
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Note | null>(null);

  async function confirmDelete() {
    if (!pendingDelete) return;
    setActionError(null);
    try {
      await remove(pendingDelete._id);
      setPendingDelete(null);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to delete note");
    }
  }

  const displayError = actionError || error;

  return (
    <>
      <PageHeader title="Notes" description="Staff notes on users." />
      <div className="card stack">
        <div className="row">
          <div className="field">
            <label>Search</label>
            <input value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <button type="button" className="btn" onClick={load}>
            Refresh
          </button>
        </div>
        {displayError ? <p className="status err">{displayError}</p> : null}
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>User</th>
                <th>Moderator</th>
                <th>Note</th>
                <th>When</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((n) => (
                <tr key={n._id}>
                  <td>
                    <div>{n.userTag || "—"}</div>
                    <div className="mono muted">{n.userId}</div>
                  </td>
                  <td>{n.moderatorTag || "—"}</td>
                  <td>{noteText(n) || "—"}</td>
                  <td className="mono muted">
                    {n.createdAt || n.timestamp
                      ? new Date(
                          (n.createdAt || n.timestamp) as string,
                        ).toLocaleString()
                      : "—"}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={() => setPendingDelete(n)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pageSize ? (
          <Pagination
            page={page}
            pageSize={pageSize}
            total={total}
            loading={loading}
            onPageChange={setPage}
          />
        ) : null}
      </div>

      <ConfirmModal
        open={pendingDelete !== null}
        title="Delete note"
        message={
          pendingDelete
            ? `Permanently delete the note for ${pendingDelete.userTag || pendingDelete.userId || "this user"}${noteText(pendingDelete) ? `: ${noteText(pendingDelete)}` : ""}? This cannot be undone.`
            : ""
        }
        confirmLabel="Delete"
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </>
  );
}
