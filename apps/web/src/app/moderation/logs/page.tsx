"use client";

import { PageHeader } from "@/components/PageHeader";
import { useOpsCollection } from "@/lib/useOpsCollection";

type ModLog = {
  _id: string;
  action?: string;
  userId?: string;
  userTag?: string;
  moderatorTag?: string;
  reason?: string;
  actionId?: string;
  timestamp?: string;
};

export default function ModLogsPage() {
  const { items, total, loading, error, q, setQ, load } =
    useOpsCollection<ModLog>("modlogs");

  return (
    <>
      <PageHeader
        title="Mod logs"
        description="Read-only browse of moderation action logs."
      />
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
                <th>Action</th>
                <th>User</th>
                <th>Moderator</th>
                <th>Reason</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {items.map((log) => (
                <tr key={log._id}>
                  <td className="mono">{log.action}</td>
                  <td>
                    <div>{log.userTag || "—"}</div>
                    <div className="mono muted">{log.userId}</div>
                  </td>
                  <td>{log.moderatorTag || "—"}</td>
                  <td>{log.reason || "—"}</td>
                  <td className="mono muted">
                    {log.timestamp
                      ? new Date(log.timestamp).toLocaleString()
                      : "—"}
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
