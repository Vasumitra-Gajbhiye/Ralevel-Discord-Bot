"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";

type Qotd = {
  _id: string;
  guildId: string;
  modOrder: { id: string; tag: string }[];
  currentIndex: number;
  lastReminderDate?: string | null;
  enabled: boolean;
};

export default function OpsQotdPage() {
  const [item, setItem] = useState<Qotd | null>(null);
  const [modOrderText, setModOrderText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function load() {
    setError(null);
    const res = await fetch("/api/ops/qotd?limit=1");
    if (!res.ok) {
      setError(await res.text());
      return;
    }
    const data = await res.json();
    const doc = data.items?.[0] || null;
    setItem(doc);
    setModOrderText(
      (doc?.modOrder || [])
        .map((m: { id: string; tag: string }) => `${m.id}|${m.tag}`)
        .join("\n"),
    );
  }

  useEffect(() => {
    load();
  }, []);

  async function save() {
    if (!item) return;
    setStatus(null);
    const modOrder = modOrderText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [id, ...tagParts] = line.split("|");
        return { id: id.trim(), tag: tagParts.join("|").trim() || id.trim() };
      });

    const res = await fetch(`/api/ops/qotd/${item._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        modOrder,
        currentIndex: item.currentIndex,
        enabled: item.enabled,
      }),
    });
    if (!res.ok) {
      setError(await res.text());
      return;
    }
    setStatus("Saved");
    await load();
  }

  return (
    <>
      <PageHeader
        title="QOTD rotation"
        description="Moderator order for question-of-the-day reminders. Format: userId|tag per line."
      />
      <div className="card stack">
        {error ? <p className="status err">{error}</p> : null}
        {status ? <p className="status ok">{status}</p> : null}
        {!item ? (
          <p className="muted">
            No QOTD rotation document yet. Create one from Discord or seed
            manually.
          </p>
        ) : (
          <>
            <label style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
              <input
                type="checkbox"
                checked={item.enabled}
                onChange={(e) =>
                  setItem({ ...item, enabled: e.target.checked })
                }
              />
              Enabled
            </label>
            <div className="field">
              <label>Current index</label>
              <input
                type="number"
                value={item.currentIndex}
                onChange={(e) =>
                  setItem({
                    ...item,
                    currentIndex: Number(e.target.value) || 0,
                  })
                }
              />
            </div>
            <div className="field">
              <label>Mod order (userId|tag)</label>
              <textarea
                value={modOrderText}
                onChange={(e) => setModOrderText(e.target.value)}
              />
            </div>
            <p className="muted">
              Last reminder date: {item.lastReminderDate || "—"}
            </p>
            <button type="button" className="btn btn-primary" onClick={save}>
              Save
            </button>
          </>
        )}
      </div>
    </>
  );
}
