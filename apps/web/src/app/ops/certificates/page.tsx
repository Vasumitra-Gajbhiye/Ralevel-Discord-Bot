"use client";

import { PageHeader } from "@/components/PageHeader";
import { useOpsCollection } from "@/lib/useOpsCollection";

type Cert = {
  _id: string;
  userId: string;
  userTag: string;
  type: string;
  status: string;
  reason?: string;
  legalName?: string;
  email?: string;
  certLink?: string;
  certId?: string;
  createdAt?: string;
};

const STATUSES = [
  "pending",
  "approved",
  "rejected",
  "details submitted",
  "completed and delivered",
];

export default function OpsCertificatesPage() {
  const {
    items,
    total,
    loading,
    error,
    q,
    setQ,
    status,
    setStatus,
    load,
    patch,
  } = useOpsCollection<Cert>("certificates");

  return (
    <>
      <PageHeader
        title="Certificates queue"
        description="Update application status and delivery fields."
      />
      <div className="card stack">
        <div className="row">
          <div className="field">
            <label>Search</label>
            <input value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="field">
            <label>Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
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
                <th>Type</th>
                <th>Status</th>
                <th>Details</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c._id}>
                  <td>
                    <div>{c.userTag}</div>
                    <div className="mono muted">{c.userId}</div>
                  </td>
                  <td>{c.type}</td>
                  <td>
                    <select
                      value={c.status}
                      onChange={(e) =>
                        patch(c._id, { status: e.target.value })
                      }
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <div className="muted">{c.legalName || "—"}</div>
                    <div className="muted">{c.email || "—"}</div>
                    <div className="mono">{c.certId || ""}</div>
                  </td>
                  <td>
                    <input
                      placeholder="Cert link"
                      defaultValue={c.certLink || ""}
                      onBlur={(e) => {
                        if (e.target.value !== (c.certLink || "")) {
                          patch(c._id, { certLink: e.target.value });
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
