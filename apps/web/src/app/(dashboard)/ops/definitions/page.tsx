"use client";

import { useMemo, useState } from "react";
import { ConfirmModal } from "@/components/ConfirmModal";
import { PageHeader } from "@/components/PageHeader";
import { Pagination } from "@/components/Pagination";
import { useGuildConfig } from "@/lib/useGuildConfig";
import { useOpsCollection } from "@/lib/useOpsCollection";

const PAGE_SIZE = 25;

type Content = {
  term?: string;
  definition?: string;
  chapter?: string;
  topic?: string;
};

type Definition = {
  _id: string;
  definitionId: number;
  subjectId: string;
  boardId: string;
  term: string;
  definition: string;
  chapter: string;
  topic: string;
  authorId: string;
  authorTag: string;
  contributors: { userId: string; userTag: string }[];
  views: number;
};

type DefinitionRequest = {
  _id: string;
  requestId: number;
  type: "create" | "edit" | "delete";
  status: "pending" | "approved" | "rejected";
  definitionId: number | null;
  subjectId: string;
  boardId: string;
  proposed?: Content;
  original?: Content | null;
  note: string;
  requesterId: string;
  requesterTag: string;
  reviewerTag: string | null;
  rejectReason: string;
  createdAt?: string;
};

type PendingDelete = { kind: "definition" | "request"; id: string; label: string };

function formatDate(value?: string) {
  return value ? new Date(value).toLocaleString() : "—";
}

export default function OpsDefinitionsPage() {
  const { config } = useGuildConfig();
  const definitions = useOpsCollection<Definition>("definitions", {
    pageSize: PAGE_SIZE,
  });
  const requests = useOpsCollection<DefinitionRequest>("definitionRequests", {
    pageSize: PAGE_SIZE,
  });
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const subjectLabels = useMemo(
    () =>
      Object.fromEntries(
        (config?.definitions?.subjects ?? []).map((s) => [s.id, s.label]),
      ),
    [config?.definitions?.subjects],
  );
  const boardLabels = useMemo(
    () =>
      Object.fromEntries(
        (config?.definitions?.boards ?? []).map((b) => [b.id, b.label]),
      ),
    [config?.definitions?.boards],
  );

  const scopeLabel = (subjectId: string, boardId: string) =>
    `${subjectLabels[subjectId] ?? subjectId}${boardId ? ` · ${boardLabels[boardId] ?? boardId}` : ""}`;

  async function patchDefinition(id: string, body: Partial<Definition>) {
    setActionError(null);
    try {
      await definitions.patch(id, body);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Save failed");
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    const target = pendingDelete;
    setPendingDelete(null);
    setActionError(null);
    try {
      if (target.kind === "definition") await definitions.remove(target.id);
      else await requests.remove(target.id);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Delete failed");
    }
  }

  return (
    <>
      <PageHeader
        title="Definitions"
        description="Browse, correct and remove definitions, and see the review history. Requests are approved or rejected in Discord."
      />
      {actionError ? <p className="status err">{actionError}</p> : null}
      <div className="stack">
        <div className="card stack">
          <h3 style={{ margin: 0, fontSize: "1rem" }}>Definitions</h3>
          <div className="row">
            <div className="field">
              <label>Search</label>
              <input
                value={definitions.q}
                placeholder="Term, text, subject ID, chapter or author"
                onChange={(e) => definitions.setQ(e.target.value)}
              />
            </div>
            <button type="button" className="btn" onClick={definitions.load}>
              Refresh
            </button>
          </div>
          {definitions.error ? (
            <p className="status err">{definitions.error}</p>
          ) : null}
          <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
            Edits save when you leave a field. Changing a term here doesn&apos;t
            check for duplicates in the same subject — the save fails if one
            exists.
          </p>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Term</th>
                  <th>Definition</th>
                  <th>Subject</th>
                  <th>Chapter / topic</th>
                  <th>Credits</th>
                  <th>Views</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {definitions.items.map((d) => (
                  <tr key={d._id}>
                    <td className="mono">{d.definitionId}</td>
                    <td>
                      <input
                        defaultValue={d.term}
                        maxLength={100}
                        onBlur={(e) => {
                          const term = e.target.value.trim();
                          if (term && term !== d.term) patchDefinition(d._id, { term });
                        }}
                      />
                    </td>
                    <td style={{ minWidth: "18rem" }}>
                      <textarea
                        defaultValue={d.definition}
                        maxLength={1000}
                        rows={3}
                        style={{ width: "100%" }}
                        onBlur={(e) => {
                          const definition = e.target.value.trim();
                          if (definition && definition !== d.definition) {
                            patchDefinition(d._id, { definition });
                          }
                        }}
                      />
                    </td>
                    <td>{scopeLabel(d.subjectId, d.boardId)}</td>
                    <td>
                      <input
                        defaultValue={d.chapter}
                        placeholder="Chapter"
                        maxLength={100}
                        onBlur={(e) => {
                          const chapter = e.target.value.trim();
                          if (chapter !== d.chapter) patchDefinition(d._id, { chapter });
                        }}
                      />
                      <input
                        defaultValue={d.topic}
                        placeholder="Topic"
                        maxLength={100}
                        style={{ marginTop: "0.25rem" }}
                        onBlur={(e) => {
                          const topic = e.target.value.trim();
                          if (topic !== d.topic) patchDefinition(d._id, { topic });
                        }}
                      />
                    </td>
                    <td>
                      <div>{d.authorTag || d.authorId}</div>
                      {d.contributors?.length ? (
                        <div className="muted" style={{ fontSize: "0.8rem" }}>
                          + {d.contributors.map((c) => c.userTag || c.userId).join(", ")}
                        </div>
                      ) : null}
                    </td>
                    <td className="mono">{d.views ?? 0}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-danger"
                        onClick={() =>
                          setPendingDelete({
                            kind: "definition",
                            id: d._id,
                            label: `definition #${d.definitionId} (${d.term})`,
                          })
                        }
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={definitions.page}
            pageSize={PAGE_SIZE}
            total={definitions.total}
            loading={definitions.loading}
            onPageChange={definitions.setPage}
          />
        </div>

        <div className="card stack">
          <h3 style={{ margin: 0, fontSize: "1rem" }}>Review requests</h3>
          <div className="row">
            <div className="field">
              <label>Status</label>
              <select
                value={requests.status}
                onChange={(e) => requests.setStatus(e.target.value)}
              >
                <option value="">All</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
            <div className="field">
              <label>Search</label>
              <input
                value={requests.q}
                placeholder="Term, subject ID or requester"
                onChange={(e) => requests.setQ(e.target.value)}
              />
            </div>
            <button type="button" className="btn" onClick={requests.load}>
              Refresh
            </button>
          </div>
          {requests.error ? <p className="status err">{requests.error}</p> : null}
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Term</th>
                  <th>Subject</th>
                  <th>Requested by</th>
                  <th>Reviewed by</th>
                  <th>Created</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {requests.items.map((r) => (
                  <tr key={r._id}>
                    <td className="mono">{r.requestId}</td>
                    <td>
                      {r.type}
                      {r.definitionId ? (
                        <span className="muted"> (#{r.definitionId})</span>
                      ) : null}
                    </td>
                    <td>
                      <span className="badge">{r.status}</span>
                    </td>
                    <td>
                      {r.proposed?.term || r.original?.term || "—"}
                      {r.note ? (
                        <div className="muted" style={{ fontSize: "0.8rem" }}>
                          {r.note}
                        </div>
                      ) : null}
                    </td>
                    <td>{scopeLabel(r.subjectId, r.boardId)}</td>
                    <td>{r.requesterTag || r.requesterId}</td>
                    <td>
                      {r.reviewerTag || "—"}
                      {r.rejectReason ? (
                        <div className="muted" style={{ fontSize: "0.8rem" }}>
                          {r.rejectReason}
                        </div>
                      ) : null}
                    </td>
                    <td>{formatDate(r.createdAt)}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-danger"
                        onClick={() =>
                          setPendingDelete({
                            kind: "request",
                            id: r._id,
                            label: `request #${r.requestId}`,
                          })
                        }
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={requests.page}
            pageSize={PAGE_SIZE}
            total={requests.total}
            loading={requests.loading}
            onPageChange={requests.setPage}
          />
        </div>
      </div>

      <ConfirmModal
        open={pendingDelete !== null}
        title="Delete"
        message={
          pendingDelete?.kind === "request"
            ? `Delete ${pendingDelete.label}? Its buttons in Discord will stop working. This doesn't change any definition.`
            : `Delete ${pendingDelete?.label}? This can't be undone.`
        }
        confirmLabel="Delete"
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </>
  );
}
