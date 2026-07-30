"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { Pagination } from "@/components/Pagination";
import { SaveActions } from "@/components/SaveActions";
import { BLOCKED_NAV_MESSAGE, useUnsavedChanges } from "@/lib/unsaved-changes";
import { useOpsCollection } from "@/lib/useOpsCollection";

type UserRow = {
  _id: string;
  guild_id?: string;
  xp?: number;
  total_messages?: number;
  createdAt?: string;
};

type RowFields = {
  xp: number;
  total_messages: number;
};

function rowFields(row: UserRow): RowFields {
  return {
    xp: row.xp ?? 0,
    total_messages: row.total_messages ?? 0,
  };
}

function fieldsEqual(a: RowFields, b: RowFields): boolean {
  return a.xp === b.xp && a.total_messages === b.total_messages;
}

function formatDate(value?: string): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString();
}

export default function OpsXpPage() {
  const {
    items,
    total,
    loading,
    error,
    q,
    setQ,
    sort,
    setSort,
    order,
    setOrder,
    xpMin,
    setXpMin,
    xpMax,
    setXpMax,
    messagesMin,
    setMessagesMin,
    messagesMax,
    setMessagesMax,
    page,
    setPage,
    pageSize,
    load,
  } = useOpsCollection<UserRow>("users", {
    pageSize: 10,
    initialSort: "xp",
    initialOrder: "desc",
  });

  const [originals, setOriginals] = useState<Record<string, RowFields>>({});
  const [edits, setEdits] = useState<Record<string, RowFields>>({});
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    setOriginals((prev) => {
      const next = { ...prev };
      for (const user of items) {
        if (!(user._id in next)) {
          next[user._id] = rowFields(user);
        }
      }
      return next;
    });
  }, [items]);

  const isDirty = useMemo(
    () =>
      Object.keys(edits).some((id) => {
        const original = originals[id];
        const edit = edits[id];
        return original && edit && !fieldsEqual(original, edit);
      }),
    [edits, originals],
  );

  const getValues = useCallback(
    (user: UserRow): RowFields => {
      const baseline = originals[user._id] ?? rowFields(user);
      const edit = edits[user._id];
      return edit ? { ...baseline, ...edit } : baseline;
    },
    [edits, originals],
  );

  function updateField(
    user: UserRow,
    field: keyof RowFields,
    value: number,
  ) {
    const current = getValues(user);
    setEdits((prev) => ({
      ...prev,
      [user._id]: { ...current, [field]: value },
    }));
  }

  function onDiscard() {
    setEdits({});
    setActionError(null);
  }

  async function onSave() {
    const dirtyIds = Object.keys(edits).filter((id) => {
      const original = originals[id];
      const edit = edits[id];
      return original && edit && !fieldsEqual(original, edit);
    });

    if (dirtyIds.length === 0) return;

    setSaving(true);
    setActionError(null);
    try {
      await Promise.all(
        dirtyIds.map((id) =>
          fetch(`/api/ops/users/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(edits[id]),
          }).then(async (res) => {
            if (!res.ok) throw new Error(await res.text());
          }),
        ),
      );
      setOriginals((prev) => {
        const next = { ...prev };
        for (const id of dirtyIds) {
          next[id] = edits[id];
        }
        return next;
      });
      setEdits((prev) => {
        const next = { ...prev };
        for (const id of dirtyIds) {
          delete next[id];
        }
        return next;
      });
      toast.success("XP changes saved");
      await load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to save changes");
    } finally {
      setSaving(false);
    }
  }

  const { saveBarRef } = useUnsavedChanges({
    isDirty,
    onDiscard,
  });

  function guardDirty(action: () => void) {
    if (isDirty) {
      toast.error(BLOCKED_NAV_MESSAGE);
      return;
    }
    action();
  }

  function handlePageChange(nextPage: number) {
    guardDirty(() => setPage(nextPage));
  }

  function handleSearchChange(value: string) {
    guardDirty(() => setQ(value));
  }

  function handleSortChange(value: string) {
    guardDirty(() => setSort(value));
  }

  function handleOrderChange(value: "asc" | "desc") {
    guardDirty(() => setOrder(value));
  }

  function handleXpMinChange(value: string) {
    guardDirty(() => setXpMin(value));
  }

  function handleXpMaxChange(value: string) {
    guardDirty(() => setXpMax(value));
  }

  function handleMessagesMinChange(value: string) {
    guardDirty(() => setMessagesMin(value));
  }

  function handleMessagesMaxChange(value: string) {
    guardDirty(() => setMessagesMax(value));
  }

  function handleRefresh() {
    guardDirty(() => {
      void load();
    });
  }

  const displayError = actionError || error;

  return (
    <>
      <PageHeader
        title="XP"
        description="View and edit XP / message totals. User ID is the document _id."
      />
      <div className="card stack">
        <div className="row">
          <div className="field">
            <label>Search</label>
            <input
              value={q}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="user id…"
            />
          </div>
          <div className="field">
            <label>Sort</label>
            <select
              value={sort}
              onChange={(e) => handleSortChange(e.target.value)}
            >
              <option value="xp">XP</option>
              <option value="total_messages">Messages</option>
              <option value="createdAt">Created</option>
            </select>
          </div>
          <div className="field">
            <label>Order</label>
            <select
              value={order}
              onChange={(e) =>
                handleOrderChange(e.target.value as "asc" | "desc")
              }
            >
              <option value="desc">Desc</option>
              <option value="asc">Asc</option>
            </select>
          </div>
          <button type="button" className="btn" onClick={handleRefresh}>
            Refresh
          </button>
        </div>
        <div className="row">
          <div className="field">
            <label>XP min</label>
            <input
              type="number"
              value={xpMin}
              onChange={(e) => handleXpMinChange(e.target.value)}
              placeholder="—"
            />
          </div>
          <div className="field">
            <label>XP max</label>
            <input
              type="number"
              value={xpMax}
              onChange={(e) => handleXpMaxChange(e.target.value)}
              placeholder="—"
            />
          </div>
          <div className="field">
            <label>Messages min</label>
            <input
              type="number"
              value={messagesMin}
              onChange={(e) => handleMessagesMinChange(e.target.value)}
              placeholder="—"
            />
          </div>
          <div className="field">
            <label>Messages max</label>
            <input
              type="number"
              value={messagesMax}
              onChange={(e) => handleMessagesMaxChange(e.target.value)}
              placeholder="—"
            />
          </div>
        </div>
        {displayError ? <p className="status err">{displayError}</p> : null}
        <p className="muted">{loading ? "Loading…" : `${total} total`}</p>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>User ID</th>
                <th>XP</th>
                <th>Messages</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {items.map((user) => {
                const values = getValues(user);
                return (
                  <tr key={user._id}>
                    <td className="mono">{user._id}</td>
                    <td>
                      <input
                        type="number"
                        value={values.xp}
                        onChange={(e) =>
                          updateField(
                            user,
                            "xp",
                            Number(e.target.value) || 0,
                          )
                        }
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        value={values.total_messages}
                        onChange={(e) =>
                          updateField(
                            user,
                            "total_messages",
                            Number(e.target.value) || 0,
                          )
                        }
                      />
                    </td>
                    <td className="muted">{formatDate(user.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {pageSize ? (
          <Pagination
            page={page}
            pageSize={pageSize}
            total={total}
            loading={loading}
            disabled={isDirty}
            onPageChange={handlePageChange}
          />
        ) : null}
      </div>

      {isDirty ? (
        <SaveActions
          saveBarRef={saveBarRef}
          isDirty={isDirty}
          saving={saving}
          onSave={onSave}
          onDiscard={onDiscard}
          saveLabel="Save XP changes"
          sticky
        />
      ) : null}
    </>
  );
}
