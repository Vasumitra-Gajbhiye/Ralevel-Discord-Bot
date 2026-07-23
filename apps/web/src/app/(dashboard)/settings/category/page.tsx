"use client";

import { useMemo, useState } from "react";
import { AddCategoryModal } from "@/components/AddCategoryModal";
import { ConfirmModal } from "@/components/ConfirmModal";
import { PageHeader, RestartBanner } from "@/components/PageHeader";
import { useGuildConfig } from "@/lib/useGuildConfig";

type CategoryEntry = { key: string; label: string; categoryId: string };

export default function CategoryPage() {
  const { config, loading, error, saving, status, save } = useGuildConfig();
  const [draft, setDraft] = useState<CategoryEntry[] | null>(null);
  const [pendingRemoveIndex, setPendingRemoveIndex] = useState<number | null>(
    null,
  );
  const [showAddModal, setShowAddModal] = useState(false);

  const savedCategories = useMemo(
    () => config?.categories ?? [],
    [config?.categories],
  );
  const categories = draft ?? savedCategories;

  const isDirty = useMemo(
    () =>
      draft !== null &&
      JSON.stringify(draft) !== JSON.stringify(savedCategories),
    [draft, savedCategories],
  );

  const pendingCategory =
    pendingRemoveIndex !== null ? categories[pendingRemoveIndex] : null;

  function updateCategory(
    index: number,
    field: "key" | "label" | "categoryId",
    value: string,
  ) {
    const next = categories.map((c, i) =>
      i === index ? { ...c, [field]: value } : c,
    );
    setDraft(next);
  }

  function handleAddCategory(category: CategoryEntry) {
    setDraft([...categories, category]);
    setShowAddModal(false);
  }

  function confirmRemove() {
    if (pendingRemoveIndex === null) return;
    setDraft(categories.filter((_, i) => i !== pendingRemoveIndex));
    setPendingRemoveIndex(null);
  }

  async function onSave() {
    await save({ categories });
    setDraft(null);
  }

  if (loading) return <p className="muted">Loading…</p>;

  const removeMessage = pendingCategory
    ? `Remove category "${pendingCategory.label || pendingCategory.key}"? Changes apply after you save.`
    : "";

  return (
    <>
      <PageHeader
        title="Categories"
        description="Discord category snowflake IDs for reference. Add display names to remember what each category is."
      />
      <RestartBanner />
      {error ? <p className="status err">{error}</p> : null}
      {status ? <p className="status ok">{status}</p> : null}

      <div className="card stack">
        <div className="row row-between">
          <button
            type="button"
            className="btn"
            onClick={() => setShowAddModal(true)}
          >
            Add category
          </button>
          <div className="row">
            {isDirty ? (
              <span className="muted" style={{ fontSize: "0.8rem" }}>
                Unsaved changes
              </span>
            ) : null}
            <button
              type="button"
              className="btn btn-primary"
              disabled={!isDirty || saving}
              onClick={onSave}
            >
              {saving ? "Saving…" : "Save categories"}
            </button>
          </div>
        </div>

        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Key</th>
                <th>Label</th>
                <th>Category ID</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {categories.map((category, i) => (
                <tr key={`${category.key}-${i}`}>
                  <td>
                    <input
                      className="input mono"
                      value={category.key}
                      onChange={(e) => updateCategory(i, "key", e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      className="input"
                      value={category.label}
                      onChange={(e) =>
                        updateCategory(i, "label", e.target.value)
                      }
                    />
                  </td>
                  <td>
                    <input
                      className="input mono"
                      value={category.categoryId}
                      onChange={(e) =>
                        updateCategory(i, "categoryId", e.target.value.trim())
                      }
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
      </div>

      <AddCategoryModal
        open={showAddModal}
        saving={saving}
        existingKeys={categories.map((c) => c.key)}
        onCancel={() => setShowAddModal(false)}
        onAdd={handleAddCategory}
      />

      <ConfirmModal
        open={pendingRemoveIndex !== null}
        title="Remove category"
        message={removeMessage}
        confirmLabel="Remove"
        variant="danger"
        onConfirm={confirmRemove}
        onCancel={() => setPendingRemoveIndex(null)}
      />
    </>
  );
}
