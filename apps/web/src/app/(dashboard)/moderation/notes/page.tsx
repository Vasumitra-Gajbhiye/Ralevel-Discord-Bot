"use client";

import { PageHeader } from "@/components/PageHeader";
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

export default function NotesPage() {
  const { items, total, loading, error, q, setQ, load, remove } =
    useOpsCollection<Note>("notes");

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
        {error ? <p className="status err">{error}</p> : null}
        <p className="muted">{loading ? "Loading…" : `${total} total`}</p>
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
                  <td>{n.note || n.content || n.reason || "—"}</td>
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
                      onClick={() => {
                        if (confirm("Delete note?")) remove(n._id);
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
