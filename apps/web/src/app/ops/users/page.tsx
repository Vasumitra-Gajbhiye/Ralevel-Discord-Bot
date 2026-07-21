"use client";

import { PageHeader } from "@/components/PageHeader";
import { useOpsCollection } from "@/lib/useOpsCollection";

type UserRow = {
  _id: string;
  guild_id?: string;
  xp?: number;
  total_messages?: number;
};

export default function OpsUsersPage() {
  const { items, total, loading, error, q, setQ, load, patch } =
    useOpsCollection<UserRow>("users");

  return (
    <>
      <PageHeader
        title="Users (XP)"
        description="View and edit XP / message totals. User ID is the document _id."
      />
      <div className="card stack">
        <div className="row">
          <div className="field">
            <label>Search</label>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="user id…"
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
                <th>User ID</th>
                <th>XP</th>
                <th>Messages</th>
              </tr>
            </thead>
            <tbody>
              {items.map((u) => (
                <tr key={u._id}>
                  <td className="mono">{u._id}</td>
                  <td>
                    <input
                      type="number"
                      defaultValue={u.xp ?? 0}
                      onBlur={(e) => {
                        const v = Number(e.target.value) || 0;
                        if (v !== (u.xp ?? 0)) patch(u._id, { xp: v });
                      }}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      defaultValue={u.total_messages ?? 0}
                      onBlur={(e) => {
                        const v = Number(e.target.value) || 0;
                        if (v !== (u.total_messages ?? 0)) {
                          patch(u._id, { total_messages: v });
                        }
                      }}
                    />
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
