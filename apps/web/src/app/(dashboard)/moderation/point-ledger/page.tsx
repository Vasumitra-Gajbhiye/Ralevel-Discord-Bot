"use client";

import { useCallback, useEffect, useState } from "react";
import { ConfirmModal } from "@/components/ConfirmModal";
import { PageHeader } from "@/components/PageHeader";
import { Pagination } from "@/components/Pagination";
import { useOpsCollection } from "@/lib/useOpsCollection";

type ModPoint = {
  _id: string;
  userId: string;
  userTag?: string;
  points: number;
  source: string;
  sourceActionId?: string;
  moderatorTag?: string;
  reason?: string;
  active?: boolean;
  voidReason?: string | null;
  voidedAt?: string | null;
  createdAt?: string;
};

type UserTotal = {
  userId: string;
  userTag?: string;
  total: number;
  entries: number;
  lastAt?: string;
};

type TotalsResponse = {
  threshold: number;
  noticeAt: number;
  expiryDays: number;
  items: UserTotal[];
};

export default function PointLedgerPage() {
  const {
    items,
    total,
    loading,
    error,
    q,
    setQ,
    status,
    setStatus,
    page,
    setPage,
    pageSize,
    load,
    patch,
  } = useOpsCollection<ModPoint>("modPoints", { pageSize: 15 });
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingVoid, setPendingVoid] = useState<ModPoint | null>(null);
  const [totals, setTotals] = useState<TotalsResponse | null>(null);

  const loadTotals = useCallback(async () => {
    try {
      const res = await fetch("/api/mod-points/totals");
      if (!res.ok) throw new Error(await res.text());
      setTotals(await res.json());
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to load totals");
    }
  }, []);

  useEffect(() => {
    loadTotals();
  }, [loadTotals]);

  async function refresh() {
    await Promise.all([load(), loadTotals()]);
  }

  async function setActive(entry: ModPoint, active: boolean) {
    setActionError(null);
    try {
      await patch(
        entry._id,
        (active
          ? { active: true, voidReason: null, voidedAt: null }
          : {
              active: false,
              voidReason: "Voided from dashboard",
              voidedAt: new Date().toISOString(),
            }) as Partial<ModPoint>,
      );
      await loadTotals();
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : "Failed to update point entry",
      );
    }
  }

  async function confirmVoid() {
    if (!pendingVoid) return;
    await setActive(pendingVoid, false);
    setPendingVoid(null);
  }

  const displayError = actionError || error;

  return (
    <>
      <PageHeader
        title="Point ledger"
        description="Every moderation point entry. Voided entries no longer count toward a user's total. Changes apply immediately."
      />

      <div className="card stack" style={{ marginBottom: "1.5rem" }}>
        <h3 style={{ margin: 0, fontSize: "1rem" }}>Top users by active points</h3>
        {totals ? (
          <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
            Auto-ban at {totals.threshold}, ban notice from {totals.noticeAt}.{" "}
            {totals.expiryDays > 0
              ? `Only counts entries from the last ${totals.expiryDays} day(s).`
              : "Points never expire."}
          </p>
        ) : null}
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>User</th>
                <th>Points</th>
                <th>Entries</th>
                <th>Last infraction</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(totals?.items ?? []).map((row) => (
                <tr key={row.userId}>
                  <td>
                    <div>{row.userTag || "—"}</div>
                    <div className="mono muted">{row.userId}</div>
                  </td>
                  <td>
                    <strong
                      className={
                        totals && row.total >= totals.noticeAt
                          ? "status err"
                          : undefined
                      }
                    >
                      {row.total}
                      {totals ? `/${totals.threshold}` : ""}
                    </strong>
                  </td>
                  <td>{row.entries}</td>
                  <td className="mono muted">
                    {row.lastAt ? new Date(row.lastAt).toLocaleString() : "—"}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => setQ(row.userId)}
                    >
                      View entries
                    </button>
                  </td>
                </tr>
              ))}
              {totals && totals.items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="muted">
                    No users have active points.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card stack">
        <div className="row">
          <div className="field">
            <label>Search</label>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="user id, tag, reason, action id…"
            />
          </div>
          <div className="field">
            <label>Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All</option>
              <option value="active">Active</option>
              <option value="voided">Voided</option>
            </select>
          </div>
          <button type="button" className="btn" onClick={refresh}>
            Refresh
          </button>
        </div>
        {displayError ? <p className="status err">{displayError}</p> : null}
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>User</th>
                <th>Points</th>
                <th>Source</th>
                <th>Moderator</th>
                <th>Reason</th>
                <th>Status</th>
                <th>When</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((entry) => (
                <tr key={entry._id}>
                  <td>
                    <div>{entry.userTag || "—"}</div>
                    <div className="mono muted">{entry.userId}</div>
                  </td>
                  <td>+{entry.points}</td>
                  <td>
                    <div>{entry.source}</div>
                    <div className="mono muted">{entry._id}</div>
                  </td>
                  <td>{entry.moderatorTag || "—"}</td>
                  <td>{entry.reason}</td>
                  <td>
                    {entry.active ? (
                      "active"
                    ) : (
                      <>
                        <div>voided</div>
                        {entry.voidReason ? (
                          <div className="muted">{entry.voidReason}</div>
                        ) : null}
                      </>
                    )}
                  </td>
                  <td className="mono muted">
                    {entry.createdAt
                      ? new Date(entry.createdAt).toLocaleString()
                      : "—"}
                  </td>
                  <td>
                    {entry.active ? (
                      <button
                        type="button"
                        className="btn"
                        onClick={() => setPendingVoid(entry)}
                      >
                        Void
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn"
                        onClick={() => setActive(entry, true)}
                      >
                        Restore
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pageSize ? (
          <Pagination
            page={page}
            pageSize={pageSize}
            total={total}
            loading={loading}
            onPageChange={setPage}
          />
        ) : null}
      </div>

      <ConfirmModal
        open={pendingVoid !== null}
        title="Void point entry"
        message={
          pendingVoid
            ? `Void ${pendingVoid.points} point(s) for ${pendingVoid.userTag || pendingVoid.userId}${pendingVoid.reason ? ` (${pendingVoid.reason})` : ""}? This does not unban anyone who was already auto-banned.`
            : ""
        }
        confirmLabel="Void"
        onConfirm={confirmVoid}
        onCancel={() => setPendingVoid(null)}
      />
    </>
  );
}
