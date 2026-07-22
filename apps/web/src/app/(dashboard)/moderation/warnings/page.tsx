"use client";

import { useState } from "react";
import { ConfirmModal } from "@/components/ConfirmModal";
import { PageHeader } from "@/components/PageHeader";
import { Pagination } from "@/components/Pagination";
import { useOpsCollection } from "@/lib/useOpsCollection";

type Warning = {
  _id: string;
  userId: string;
  userTag: string;
  moderatorTag?: string;
  reason?: string;
  actionId?: string;
  active?: boolean;
  timestamp?: string;
};

export default function WarningsPage() {
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
    patch,
    remove,
  } = useOpsCollection<Warning>("warnings", { pageSize: 15 });
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingDeactivate, setPendingDeactivate] = useState<Warning | null>(
    null,
  );
  const [pendingDelete, setPendingDelete] = useState<Warning | null>(null);

  async function confirmDeactivate() {
    if (!pendingDeactivate) return;
    setActionError(null);
    try {
      await patch(pendingDeactivate._id, {
        active: false,
      } as Partial<Warning>);
      setPendingDeactivate(null);
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : "Failed to deactivate warning",
      );
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setActionError(null);
    try {
      await remove(pendingDelete._id);
      setPendingDelete(null);
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : "Failed to delete warning",
      );
    }
  }

  async function activateWarning(warning: Warning) {
    setActionError(null);
    try {
      await patch(warning._id, { active: true } as Partial<Warning>);
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : "Failed to activate warning",
      );
    }
  }

  const displayError = actionError || error;

  return (
    <>
      <PageHeader
        title="Warnings"
        description="Browse and manage moderation warnings. Changes apply immediately."
      />
      <div className="card stack">
        <div className="row">
          <div className="field">
            <label>Search</label>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="user id, tag, reason…"
            />
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
                <th>Reason</th>
                <th>Active</th>
                <th>When</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((w) => (
                <tr key={w._id}>
                  <td>
                    <div>{w.userTag}</div>
                    <div className="mono muted">{w.userId}</div>
                  </td>
                  <td>{w.moderatorTag || "—"}</td>
                  <td>{w.reason}</td>
                  <td>{w.active ? "yes" : "no"}</td>
                  <td className="mono muted">
                    {w.timestamp
                      ? new Date(w.timestamp).toLocaleString()
                      : "—"}
                  </td>
                  <td className="row">
                    {w.active ? (
                      <button
                        type="button"
                        className="btn"
                        onClick={() => setPendingDeactivate(w)}
                      >
                        Deactivate
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn"
                        onClick={() => activateWarning(w)}
                      >
                        Activate
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={() => setPendingDelete(w)}
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
        open={pendingDeactivate !== null}
        title="Deactivate warning"
        message={
          pendingDeactivate
            ? `Deactivate the warning for ${pendingDeactivate.userTag}${pendingDeactivate.reason ? `: ${pendingDeactivate.reason}` : ""}?`
            : ""
        }
        confirmLabel="Deactivate"
        onConfirm={confirmDeactivate}
        onCancel={() => setPendingDeactivate(null)}
      />

      <ConfirmModal
        open={pendingDelete !== null}
        title="Delete warning"
        message={
          pendingDelete
            ? `Permanently delete the warning for ${pendingDelete.userTag}${pendingDelete.reason ? `: ${pendingDelete.reason}` : ""}? This cannot be undone.`
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
