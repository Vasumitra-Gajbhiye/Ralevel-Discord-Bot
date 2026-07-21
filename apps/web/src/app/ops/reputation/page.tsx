"use client";

import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { useOpsCollection } from "@/lib/useOpsCollection";

type Rep = { _id: string; userId: string; rep: number };
type RepBan = { _id: string; userId: string; reason?: string };

export default function OpsReputationPage() {
  const rep = useOpsCollection<Rep>("reputation");
  const bans = useOpsCollection<RepBan>("repBans");
  const [banUserId, setBanUserId] = useState("");

  return (
    <>
      <PageHeader
        title="Reputation"
        description="Adjust reputation values and manage rep bans."
      />
      <div className="stack">
        <div className="card stack">
          <h3 style={{ margin: 0, fontSize: "1rem" }}>Scores</h3>
          <div className="row">
            <div className="field">
              <label>Search user ID</label>
              <input value={rep.q} onChange={(e) => rep.setQ(e.target.value)} />
            </div>
            <button type="button" className="btn" onClick={rep.load}>
              Refresh
            </button>
          </div>
          {rep.error ? <p className="status err">{rep.error}</p> : null}
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>User ID</th>
                  <th>Rep</th>
                </tr>
              </thead>
              <tbody>
                {rep.items.map((r) => (
                  <tr key={r._id}>
                    <td className="mono">{r.userId}</td>
                    <td>
                      <input
                        type="number"
                        defaultValue={r.rep}
                        onBlur={(e) => {
                          const v = Number(e.target.value) || 0;
                          if (v !== r.rep) rep.patch(r._id, { rep: v });
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
          <h3 style={{ margin: 0, fontSize: "1rem" }}>Rep bans</h3>
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
                  <th />
                </tr>
              </thead>
              <tbody>
                {bans.items.map((b) => (
                  <tr key={b._id}>
                    <td className="mono">{b.userId}</td>
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
