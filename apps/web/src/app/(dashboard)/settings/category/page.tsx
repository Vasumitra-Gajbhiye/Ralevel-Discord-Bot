"use client";

import { useMemo, useState } from "react";
import { AddCategoryModal } from "@/components/AddCategoryModal";
import { ConfirmModal } from "@/components/ConfirmModal";
import { PageHeader, RestartBanner } from "@/components/PageHeader";
import { SaveActions } from "@/components/SaveActions";
import { useGuildConfig } from "@/lib/useGuildConfig";
import { useUnsavedChanges } from "@/lib/unsaved-changes";

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

  const { saveBarRef } = useUnsavedChanges({
    isDirty,
    onDiscard: () => setDraft(null),
  });

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
          <SaveActions
            saveBarRef={saveBarRef}
            isDirty={isDirty}
            saving={saving}
            onSave={onSave}
            onDiscard={() => setDraft(null)}
            saveLabel="Save categories"
          />
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
