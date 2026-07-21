"use client";

import { useUser } from "@clerk/nextjs";
import { useCallback, useEffect, useState } from "react";
import { AddAccessModal } from "@/components/AddAccessModal";
import { ConfirmModal } from "@/components/ConfirmModal";
import { PageHeader } from "@/components/PageHeader";

type AccessEntry = {
  id: string;
  email: string;
  name: string;
  createdAt: number;
};

export default function AccessPage() {
  const { user } = useUser();
  const [entries, setEntries] = useState<AccessEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [adding, setAdding] = useState(false);
  const [pendingRemove, setPendingRemove] = useState<AccessEntry | null>(null);
  const [removing, setRemoving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [savingName, setSavingName] = useState(false);

  const currentEmail =
    user?.primaryEmailAddress?.emailAddress?.toLowerCase() ?? null;

  const loadEntries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/access");
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to load access list");
      }
      setEntries(data.entries ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load access list");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  async function handleAdd(entry: { name: string; email: string }) {
    setAdding(true);
    setStatus(null);
    setError(null);
    try {
      const res = await fetch("/api/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to add person");
      }
      setShowAddModal(false);
      setStatus(
        `Added ${data.entry.name ? `${data.entry.name} (${data.entry.email})` : data.entry.email}`,
      );
      await loadEntries();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add person");
      throw e;
    } finally {
      setAdding(false);
    }
  }

  function startEditing(entry: AccessEntry) {
    setEditingId(entry.id);
    setEditingName(entry.name);
    setError(null);
  }

  function cancelEditing() {
    setEditingId(null);
    setEditingName("");
  }

  async function saveName(entry: AccessEntry) {
    const nextName = editingName.trim();
    if (nextName === entry.name) {
      cancelEditing();
      return;
    }

    setSavingName(true);
    setError(null);
    try {
      const res = await fetch(`/api/access/${entry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nextName }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update name");
      }
      setStatus(`Updated name for ${entry.email}`);
      cancelEditing();
      await loadEntries();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update name");
    } finally {
      setSavingName(false);
    }
  }

  async function confirmRemove() {
    if (!pendingRemove) return;
    setRemoving(true);
    setError(null);
    try {
      const res = await fetch(`/api/access/${pendingRemove.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to remove person");
      }
      setStatus(
        `Removed ${pendingRemove.name ? `${pendingRemove.name} (${pendingRemove.email})` : pendingRemove.email}`,
      );
      setPendingRemove(null);
      await loadEntries();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove person");
    } finally {
      setRemoving(false);
    }
  }

  if (loading) return <p className="muted">Loading…</p>;

  return (
    <>
      <PageHeader
        title="Access"
        description="Manage who can sign up and sign in to this dashboard."
      />

      {error ? <p className="status err">{error}</p> : null}
      {status ? <p className="status ok">{status}</p> : null}

      <div className="card stack">
        <div className="row row-between">
          <p className="muted" style={{ margin: 0 }}>
            {entries.length} allowlisted {entries.length === 1 ? "person" : "people"}.
            Only these emails can create accounts when Clerk restricted mode is
            enabled.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setShowAddModal(true)}
          >
            Add person
          </button>
        </div>

        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Added</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={4} className="muted" style={{ textAlign: "center" }}>
                    No allowlisted people yet. Click &quot;Add person&quot; to get
                    started.
                  </td>
                </tr>
              ) : (
                entries.map((entry) => {
                  const isSelf =
                    currentEmail === entry.email.toLowerCase();
                  const isEditing = editingId === entry.id;

                  return (
                    <tr key={entry.id}>
                      <td>
                        {isEditing ? (
                          <div className="row">
                            <input
                              className="input"
                              value={editingName}
                              onChange={(e) => setEditingName(e.target.value)}
                              placeholder="Name"
                              disabled={savingName}
                              autoFocus
                            />
                            <button
                              type="button"
                              className="btn btn-sm btn-primary"
                              disabled={savingName}
                              onClick={() => void saveName(entry)}
                            >
                              {savingName ? "Saving…" : "Save"}
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm"
                              disabled={savingName}
                              onClick={cancelEditing}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="row">
                            <span>{entry.name || "—"}</span>
                            {isSelf ? <span className="badge">You</span> : null}
                            <button
                              type="button"
                              className="btn btn-sm"
                              onClick={() => startEditing(entry)}
                            >
                              Edit
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="mono">{entry.email}</td>
                      <td className="muted">
                        {new Date(entry.createdAt).toLocaleString()}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          disabled={isSelf || removing}
                          onClick={() => setPendingRemove(entry)}
                          title={
                            isSelf
                              ? "You cannot remove your own email"
                              : "Remove from allowlist"
                          }
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AddAccessModal
        open={showAddModal}
        saving={adding}
        existingEmails={entries.map((entry) => entry.email.toLowerCase())}
        onCancel={() => setShowAddModal(false)}
        onAdd={handleAdd}
      />

      <ConfirmModal
        open={pendingRemove !== null}
        title="Remove person"
        message={
          pendingRemove
            ? `Remove ${pendingRemove.name ? `${pendingRemove.name} (${pendingRemove.email})` : pendingRemove.email} from the allowlist? They will no longer be able to sign in.`
            : ""
        }
        confirmLabel="Remove"
        variant="danger"
        onConfirm={confirmRemove}
        onCancel={() => setPendingRemove(null)}
      />
    </>
  );
}
