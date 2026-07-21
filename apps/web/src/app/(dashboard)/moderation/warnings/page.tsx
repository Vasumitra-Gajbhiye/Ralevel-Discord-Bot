"use client";

import { PageHeader } from "@/components/PageHeader";
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
  const { items, total, loading, error, q, setQ, load, patch, remove } =
    useOpsCollection<Warning>("warnings");

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
        {error ? <p className="status err">{error}</p> : null}
        <p className="muted">{loading ? "Loading…" : `${total} total`}</p>
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
                    <button
                      type="button"
                      className="btn"
                      onClick={() =>
                        patch(w._id, { active: !w.active } as Partial<Warning>)
                      }
                    >
                      {w.active ? "Deactivate" : "Activate"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={() => {
                        if (confirm("Delete warning?")) remove(w._id);
                      }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
