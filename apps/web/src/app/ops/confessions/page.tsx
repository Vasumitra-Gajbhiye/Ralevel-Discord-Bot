"use client";

import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { useOpsCollection } from "@/lib/useOpsCollection";

type Confession = {
  _id: string;
  userId?: string;
  authorId?: string;
  content?: string;
  status?: string;
  confessionId?: string | number;
  createdAt?: string;
};

type Ban = {
  _id: string;
  userId: string;
  reason?: string;
};

export default function OpsConfessionsPage() {
  const confessions = useOpsCollection<Confession>("confessions");
  const bans = useOpsCollection<Ban>("confessionBans");
  const [newBanUserId, setNewBanUserId] = useState("");
  const [newBanReason, setNewBanReason] = useState("");

  return (
    <>
      <PageHeader
        title="Confessions"
        description="Manage confession queue status and confession bans."
      />
      <div className="stack">
        <div className="card stack">
          <h3 style={{ margin: 0, fontSize: "1rem" }}>Queue</h3>
          <div className="row">
            <div className="field">
              <label>Search</label>
              <input
                value={confessions.q}
                onChange={(e) => confessions.setQ(e.target.value)}
              />
            </div>
            <button type="button" className="btn" onClick={confessions.load}>
              Refresh
            </button>
          </div>
          {confessions.error ? (
            <p className="status err">{confessions.error}</p>
          ) : null}
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>User</th>
                  <th>Content</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {confessions.items.map((c) => (
                  <tr key={c._id}>
                    <td className="mono">{c.confessionId ?? "—"}</td>
                    <td className="mono">{c.authorId || c.userId}</td>
                    <td>{c.content}</td>
                    <td>
                      <select
                        value={c.status || "PENDING"}
                        onChange={(e) =>
                          confessions.patch(c._id, { status: e.target.value })
                        }
                      >
                        {["PENDING", "APPROVED", "REJECTED"].map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card stack">
          <h3 style={{ margin: 0, fontSize: "1rem" }}>Confession bans</h3>
          <div className="row">
            <div className="field">
              <label>User ID</label>
              <input
                className="mono"
                value={newBanUserId}
                onChange={(e) => setNewBanUserId(e.target.value)}
              />
            </div>
            <div className="field">
              <label>Reason</label>
              <input
                value={newBanReason}
                onChange={(e) => setNewBanReason(e.target.value)}
              />
            </div>
            <button
              type="button"
              className="btn btn-primary"
              onClick={async () => {
                if (!newBanUserId.trim()) return;
                await bans.create({
                  userId: newBanUserId.trim(),
                  reason: newBanReason,
                });
                setNewBanUserId("");
                setNewBanReason("");
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
