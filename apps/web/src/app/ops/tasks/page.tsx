"use client";

import { PageHeader } from "@/components/PageHeader";
import { useOpsCollection } from "@/lib/useOpsCollection";

type Task = {
  _id: string;
  taskId: string;
  title: string;
  team: string;
  status: string;
  assignedTo?: string[];
  createdBy?: string;
  deadline?: string;
};

export default function OpsTasksPage() {
  const { items, total, loading, error, q, setQ, load, patch, remove } =
    useOpsCollection<Task>("tasks");

  return (
    <>
      <PageHeader title="Tasks" description="Team task board data." />
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
                <th>Title</th>
                <th>Team</th>
                <th>Status</th>
                <th>Assignees</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((t) => (
                <tr key={t._id}>
                  <td className="mono">{t.taskId}</td>
                  <td>{t.title}</td>
                  <td>{t.team}</td>
                  <td>
                    <select
                      value={t.status}
                      onChange={(e) =>
                        patch(t._id, { status: e.target.value })
                      }
                    >
                      {["open", "claimed", "completed"].map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="mono muted">
                    {(t.assignedTo || []).join(", ") || "—"}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={() => {
                        if (confirm("Delete task?")) remove(t._id);
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
