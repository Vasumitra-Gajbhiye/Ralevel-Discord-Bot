"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { Pagination } from "@/components/Pagination";
import { SaveActions } from "@/components/SaveActions";
import { BLOCKED_NAV_MESSAGE, useUnsavedChanges } from "@/lib/unsaved-changes";

type XpBan = {
  _id: string;
  userId: string;
  reason?: string;
};

const PAGE_SIZE = 10;
const TEMP_ID_PREFIX = "temp-";

function normalizeBans(bans: XpBan[]): XpBan[] {
  return [...bans]
    .map((ban) => ({
      _id: ban._id,
      userId: ban.userId,
      reason: ban.reason ?? "",
    }))
    .sort((a, b) => a.userId.localeCompare(b.userId));
}

function bansEqual(a: XpBan[], b: XpBan[]): boolean {
  return JSON.stringify(normalizeBans(a)) === JSON.stringify(normalizeBans(b));
}

export default function OpsXpBansPage() {
  const [savedBans, setSavedBans] = useState<XpBan[]>([]);
  const [draftBans, setDraftBans] = useState<XpBan[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [banUserId, setBanUserId] = useState("");
  const [banReason, setBanReason] = useState("");

  const allBans = draftBans ?? savedBans;

  const isDirty = useMemo(
    () => draftBans !== null && !bansEqual(draftBans, savedBans),
    [draftBans, savedBans],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ops/xpBans?limit=500");
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      const items = (data.items || []) as XpBan[];
      setSavedBans(items);
      setDraftBans(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load XP bans");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredBans = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return allBans;
    return allBans.filter(
      (ban) =>
        ban.userId.toLowerCase().includes(query) ||
        (ban.reason ?? "").toLowerCase().includes(query),
    );
  }, [allBans, q]);

  useEffect(() => {
    setPage(1);
  }, [q]);

  const total = filteredBans.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const pageItems = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredBans.slice(start, start + PAGE_SIZE);
  }, [filteredBans, page]);

  function getDraftList(): XpBan[] {
    return draftBans ?? savedBans;
  }

  function updateDraft(next: XpBan[]) {
    setDraftBans(next);
  }

  function onDiscard() {
    setDraftBans(null);
    setActionError(null);
  }

  async function onSave() {
    if (!draftBans) return;

    const savedMap = new Map(savedBans.map((ban) => [ban._id, ban]));
    const draftMap = new Map(draftBans.map((ban) => [ban._id, ban]));

    const creates = draftBans.filter((ban) =>
      ban._id.startsWith(TEMP_ID_PREFIX),
    );
    const deletes = savedBans.filter((ban) => !draftMap.has(ban._id));
    const updates = draftBans.filter((ban) => {
      if (ban._id.startsWith(TEMP_ID_PREFIX)) return false;
      const saved = savedMap.get(ban._id);
      if (!saved) return false;
      return (saved.reason ?? "") !== (ban.reason ?? "");
    });

    setSaving(true);
    setActionError(null);
    try {
      await Promise.all([
        ...creates.map((ban) =>
          fetch("/api/ops/xpBans", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userId: ban.userId,
              reason: ban.reason || undefined,
            }),
          }).then(async (res) => {
            if (!res.ok) throw new Error(await res.text());
          }),
        ),
        ...deletes.map((ban) =>
          fetch(`/api/ops/xpBans/${ban._id}`, {
            method: "DELETE",
          }).then(async (res) => {
            if (!res.ok) throw new Error(await res.text());
          }),
        ),
        ...updates.map((ban) =>
          fetch(`/api/ops/xpBans/${ban._id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reason: ban.reason || undefined }),
          }).then(async (res) => {
            if (!res.ok) throw new Error(await res.text());
          }),
        ),
      ]);
      toast.success("XP ban changes saved");
      await load();
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : "Failed to save XP ban changes",
      );
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

  function handleRefresh() {
    guardDirty(() => {
      void load();
    });
  }

  function addBan() {
    const userId = banUserId.trim();
    if (!userId) return;

    const list = getDraftList();
    if (list.some((ban) => ban.userId === userId)) {
      setActionError("That user is already in the ban list.");
      return;
    }

    updateDraft([
      ...list,
      {
        _id: `${TEMP_ID_PREFIX}${crypto.randomUUID()}`,
        userId,
        reason: banReason.trim() || undefined,
      },
    ]);
    setBanUserId("");
    setBanReason("");
    setActionError(null);
  }

  function removeBan(banId: string) {
    updateDraft(getDraftList().filter((ban) => ban._id !== banId));
  }

  function updateReason(banId: string, reason: string) {
    updateDraft(
      getDraftList().map((ban) =>
        ban._id === banId ? { ...ban, reason } : ban,
      ),
    );
  }

  const displayError = actionError || error;

  return (
    <>
      <PageHeader
        title="XP bans"
        description="Manage users blocked from earning XP. Changes are saved when you click Save."
      />
      <div className="card stack">
        <div className="row">
          <div className="field">
            <label>Search</label>
            <input
              value={q}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="user id or reason…"
            />
          </div>
          <button type="button" className="btn" onClick={handleRefresh}>
            Refresh
          </button>
        </div>

        <div className="row">
          <div className="field">
            <label>User ID</label>
            <input
              className="mono"
              value={banUserId}
              onChange={(e) => setBanUserId(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Reason</label>
            <input
              value={banReason}
              onChange={(e) => setBanReason(e.target.value)}
              placeholder="optional"
            />
          </div>
          <button type="button" className="btn btn-primary" onClick={addBan}>
            Add ban
          </button>
        </div>

        {displayError ? <p className="status err">{displayError}</p> : null}
        <p className="muted">{loading ? "Loading…" : `${total} total`}</p>

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
              {pageItems.map((ban) => (
                <tr key={ban._id}>
                  <td className="mono">{ban.userId}</td>
                  <td>
                    <input
                      value={ban.reason ?? ""}
                      onChange={(e) => updateReason(ban._id, e.target.value)}
                      placeholder="—"
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={() => removeBan(ban._id)}
                    >
                      Unban
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          loading={loading}
          disabled={isDirty}
          onPageChange={handlePageChange}
        />
      </div>

      {isDirty ? (
        <SaveActions
          saveBarRef={saveBarRef}
          isDirty={isDirty}
          saving={saving}
          onSave={onSave}
          onDiscard={onDiscard}
          saveLabel="Save XP ban changes"
          sticky
        />
      ) : null}
    </>
  );
}
