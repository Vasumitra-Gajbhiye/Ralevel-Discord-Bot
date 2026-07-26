"use client";

import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { useOpsCollection } from "@/lib/useOpsCollection";

type UserRow = {
  _id: string;
  guild_id?: string;
  xp?: number;
  total_messages?: number;
};

type XpBan = { _id: string; userId: string; reason?: string };

export default function OpsUsersPage() {
  const { items, total, loading, error, q, setQ, load, patch } =
    useOpsCollection<UserRow>("users");
  const bans = useOpsCollection<XpBan>("xpBans");
  const [banUserId, setBanUserId] = useState("");

  return (
    <>
      <PageHeader
        title="Users (XP)"
        description="View and edit XP / message totals. User ID is the document _id."
      />
      <div className="stack">
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

        <div className="card stack">
          <h3 style={{ margin: 0, fontSize: "1rem" }}>XP bans</h3>
          <div className="row">
            <div className="field">
              <label>User ID</label>
              <input
                className="mono"
                value={banUserId}
                onChange={(e) => setBanUserId(e.target.value)}
              />
            </div>
            <button
              type="button"
              className="btn btn-primary"
              onClick={async () => {
                if (!banUserId.trim()) return;
                await bans.create({ userId: banUserId.trim() });
                setBanUserId("");
              }}
            >
              Ban
            </button>
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>User ID</th>
                  <th>Reason</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {bans.items.map((b) => (
                  <tr key={b._id}>
                    <td className="mono">{b.userId}</td>
                    <td>{b.reason || "—"}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-danger"
                        onClick={() => bans.remove(b._id)}
                      >
                        Unban
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
