"use client";

import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { useOpsCollection } from "@/lib/useOpsCollection";

type Helper = {
  _id: string;
  channelId: string;
  roleId: string;
};

export default function OpsHelpersPage() {
  const { items, total, loading, error, load, create, remove, patch } =
    useOpsCollection<Helper>("helpers");
  const [channelId, setChannelId] = useState("");
  const [roleId, setRoleId] = useState("");

  return (
    <>
      <PageHeader
        title="Helper mappings"
        description="Map a channel to a helper role for /helper pings."
      />
      <div className="card stack">
        <div className="row">
          <div className="field">
            <label>Channel ID</label>
            <input
              className="mono"
              value={channelId}
              onChange={(e) => setChannelId(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Role ID</label>
            <input
              className="mono"
              value={roleId}
              onChange={(e) => setRoleId(e.target.value)}
            />
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={async () => {
              if (!channelId.trim() || !roleId.trim()) return;
              await create({
                channelId: channelId.trim(),
                roleId: roleId.trim(),
              });
              setChannelId("");
              setRoleId("");
            }}
          >
            Add
          </button>
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
                <th>Channel ID</th>
                <th>Role ID</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((h) => (
                <tr key={h._id}>
                  <td>
                    <input
                      className="mono"
                      defaultValue={h.channelId}
                      onBlur={(e) => {
                        if (e.target.value !== h.channelId) {
                          patch(h._id, { channelId: e.target.value });
                        }
                      }}
                    />
                  </td>
                  <td>
                    <input
                      className="mono"
                      defaultValue={h.roleId}
                      onBlur={(e) => {
                        if (e.target.value !== h.roleId) {
                          patch(h._id, { roleId: e.target.value });
                        }
                      }}
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={() => remove(h._id)}
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
