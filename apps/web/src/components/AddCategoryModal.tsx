"use client";

import { useEffect, useState } from "react";

type CategoryDraft = { key: string; label: string; categoryId: string };

type AddCategoryModalProps = {
  open: boolean;
  saving: boolean;
  existingKeys: string[];
  onCancel: () => void;
  onAdd: (category: CategoryDraft) => void | Promise<void>;
};

const emptyForm: CategoryDraft = { key: "", label: "", categoryId: "" };

export function AddCategoryModal({
  open,
  saving,
  existingKeys,
  onCancel,
  onAdd,
}: AddCategoryModalProps) {
  const [form, setForm] = useState<CategoryDraft>(emptyForm);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm(emptyForm);
    setError(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !saving) onCancel();
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, saving, onCancel]);

  function updateField(field: keyof CategoryDraft, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const key = form.key.trim();
    const label = form.label.trim();
    const categoryId = form.categoryId.trim();

    if (!key) {
      setError("Key is required.");
      return;
    }
    if (!label) {
      setError("Label is required.");
      return;
    }
    if (existingKeys.includes(key)) {
      setError(`Category key "${key}" already exists.`);
      return;
    }

    await onAdd({ key, label, categoryId });
  }

  if (!open) return null;

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={saving ? undefined : onCancel}
    >
      <div
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-category-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="add-category-modal-title">Add category</h3>
        <p>
          Enter the category details. Saving adds it to the guild config when
          you click Save categories.
        </p>

        <form className="modal-form" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="add-category-key">Key</label>
            <input
              id="add-category-key"
              className="input mono"
              value={form.key}
              onChange={(e) => updateField("key", e.target.value)}
              placeholder="e.g. staff"
              autoFocus
              disabled={saving}
            />
          </div>
          <div className="field">
            <label htmlFor="add-category-label">Label</label>
            <input
              id="add-category-label"
              className="input"
              value={form.label}
              onChange={(e) => updateField("label", e.target.value)}
              placeholder="e.g. Staff channels"
              disabled={saving}
            />
          </div>
          <div className="field">
            <label htmlFor="add-category-id">Discord category ID</label>
            <input
              id="add-category-id"
              className="input mono"
              value={form.categoryId}
              onChange={(e) => updateField("categoryId", e.target.value)}
              placeholder="Snowflake ID"
              disabled={saving}
            />
          </div>

          {error ? <p className="modal-error">{error}</p> : null}

          <div className="modal-actions">
            <button
              type="button"
              className="btn"
              onClick={onCancel}
              disabled={saving}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              Add
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
