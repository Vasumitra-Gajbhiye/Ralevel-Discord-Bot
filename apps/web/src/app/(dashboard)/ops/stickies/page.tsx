"use client";

import { PageHeader } from "@/components/PageHeader";
import { useOpsCollection } from "@/lib/useOpsCollection";

type Sticky = {
  _id: string;
  channelId: string;
  content?: string;
  lineThreshold?: number;
  enabled?: boolean;
  lastMessageId?: string;
};

export default function OpsStickiesPage() {
  const { items, total, loading, error, load, patch, remove } =
    useOpsCollection<Sticky>("stickies");

  return (
    <>
      <PageHeader
        title="Stickies"
        description="Edit sticky content and thresholds in Mongo. Discord resync requires bot sticky commands."
      />
      <div className="card stack">
        <button type="button" className="btn" onClick={load}>
          Refresh
        </button>
        {error ? <p className="status err">{error}</p> : null}
        <p className="muted">{loading ? "Loading…" : `${total} total`}</p>
        <div className="stack">
          {items.map((s) => (
            <div className="card stack" key={s._id}>
              <div className="row">
                <div className="field">
                  <label>Channel ID</label>
                  <input className="mono" value={s.channelId} readOnly />
                </div>
                <div className="field">
                  <label>Line threshold</label>
                  <input
                    type="number"
                    defaultValue={s.lineThreshold ?? 8}
                    onBlur={(e) => {
                      const v = Number(e.target.value) || 8;
                      if (v !== s.lineThreshold) {
                        patch(s._id, { lineThreshold: v });
                      }
                    }}
                  />
                </div>
                <label style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={s.enabled !== false}
                    onChange={(e) =>
                      patch(s._id, { enabled: e.target.checked })
                    }
                  />
                  Enabled
                </label>
              </div>
              <div className="field">
                <label>Content</label>
                <textarea
                  defaultValue={s.content || ""}
                  onBlur={(e) => {
                    if (e.target.value !== (s.content || "")) {
                      patch(s._id, { content: e.target.value });
                    }
                  }}
                />
              </div>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => {
                  if (confirm("Delete sticky?")) remove(s._id);
                }}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
