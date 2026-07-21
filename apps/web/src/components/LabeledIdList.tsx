"use client";

import { useState } from "react";
import { AddLabeledIdModal } from "@/components/AddLabeledIdModal";
import { ConfirmModal } from "@/components/ConfirmModal";
import type { IdLabel } from "@/lib/reputationIds";

type LabeledIdListProps = {
  title: string;
  description?: string;
  items: IdLabel[];
  onChange: (items: IdLabel[]) => void;
  addButtonLabel: string;
  addModalTitle: string;
  idColumnLabel: string;
};

export function LabeledIdList({
  title,
  description,
  items,
  onChange,
  addButtonLabel,
  addModalTitle,
  idColumnLabel,
}: LabeledIdListProps) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [pendingRemoveIndex, setPendingRemoveIndex] = useState<number | null>(
    null,
  );

  const pendingItem =
    pendingRemoveIndex !== null ? items[pendingRemoveIndex] : null;

  function updateItem(index: number, field: keyof IdLabel, value: string) {
    onChange(
      items.map((item, i) =>
        i === index ? { ...item, [field]: value } : item,
      ),
    );
  }

  function handleAdd(entry: IdLabel) {
    onChange([...items, entry]);
    setShowAddModal(false);
  }

  function confirmRemove() {
    if (pendingRemoveIndex === null) return;
    onChange(items.filter((_, i) => i !== pendingRemoveIndex));
    setPendingRemoveIndex(null);
  }

  const removeMessage = pendingItem
    ? `Remove "${pendingItem.label || pendingItem.id}" (${pendingItem.id})? Changes apply after you save.`
    : "";

  return (
    <>
      <div className="stack" style={{ gap: "0.75rem" }}>
        <div>
          <h4 style={{ margin: 0, fontSize: "0.95rem" }}>{title}</h4>
          {description ? (
            <p className="muted" style={{ fontSize: "0.85rem", margin: "0.25rem 0 0" }}>
              {description}
            </p>
          ) : null}
        </div>

        {items.length > 0 ? (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>{idColumnLabel}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => (
                  <tr key={`${item.id}-${i}`}>
                    <td>
                      <input
                        className="input"
                        value={item.label}
                        onChange={(e) => updateItem(i, "label", e.target.value)}
                        placeholder="Display name"
                        style={{ width: "100%" }}
                      />
                    </td>
                    <td>
                      <input
                        className="input mono"
                        value={item.id}
                        onChange={(e) => updateItem(i, "id", e.target.value)}
                        style={{ width: "100%" }}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={() => setPendingRemoveIndex(i)}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted" style={{ fontSize: "0.85rem", margin: 0 }}>
            No entries yet.
          </p>
        )}

        <button
          type="button"
          className="btn"
          onClick={() => setShowAddModal(true)}
        >
          {addButtonLabel}
        </button>
      </div>

      <AddLabeledIdModal
        open={showAddModal}
        title={addModalTitle}
        idLabel={idColumnLabel}
        existingIds={items.map((item) => item.id)}
        onCancel={() => setShowAddModal(false)}
        onAdd={handleAdd}
      />

      <ConfirmModal
        open={pendingRemoveIndex !== null}
        title={`Remove ${title.toLowerCase()}`}
        message={removeMessage}
        confirmLabel="Remove"
        variant="danger"
        onConfirm={confirmRemove}
        onCancel={() => setPendingRemoveIndex(null)}
      />
    </>
  );
}
