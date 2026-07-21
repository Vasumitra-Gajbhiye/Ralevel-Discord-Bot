"use client";

import { PageHeader } from "@/components/PageHeader";
import { useOpsCollection } from "@/lib/useOpsCollection";

type Poll = {
  _id: string;
  pollId?: number;
  question: string;
  status: string;
  channelId?: string;
  choiceType?: string;
  deadline?: string | null;
  createdAt?: string;
};

export default function OpsPollsPage() {
  const { items, total, loading, error, q, setQ, load, patch } =
    useOpsCollection<Poll>("polls");

  return (
    <>
      <PageHeader
        title="Polls"
        description="Browse polls and close them in the database."
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
                <th>ID</th>
                <th>Question</th>
                <th>Status</th>
                <th>Channel</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p._id}>
                  <td className="mono">{p.pollId ?? "—"}</td>
                  <td>{p.question}</td>
                  <td>{p.status}</td>
                  <td className="mono muted">{p.channelId}</td>
                  <td>
                    {p.status === "active" ? (
                      <button
                        type="button"
                        className="btn"
                        onClick={() => patch(p._id, { status: "closed" })}
                      >
                        Close
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn"
                        onClick={() => patch(p._id, { status: "active" })}
                      >
                        Reopen
                      </button>
                    )}
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
