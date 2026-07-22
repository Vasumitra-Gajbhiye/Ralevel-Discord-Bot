"use client";

type PaginationProps = {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  loading?: boolean;
};

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  loading = false,
}: PaginationProps) {
  if (total === 0) return null;

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  const showControls = total > pageSize;

  return (
    <div className="pagination">
      <p className="pagination-info muted">
        {loading ? "Loading…" : `Showing ${start}–${end} of ${total}`}
      </p>
      {showControls ? (
        <div className="pagination-controls">
          <button
            type="button"
            className="btn btn-sm"
            disabled={loading || page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            ← Previous
          </button>
          <span className="pagination-page muted">
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            className="btn btn-sm"
            disabled={loading || page >= totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            Next →
          </button>
        </div>
      ) : null}
    </div>
  );
}
