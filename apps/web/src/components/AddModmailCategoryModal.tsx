"use client";

import { useEffect, useState } from "react";
import { InfoHelpIcon } from "@/components/InfoHelpIcon";

export type ModmailCategoryDraft = {
  value: string;
  label: string;
  description: string;
};

type AddModmailCategoryModalProps = {
  open: boolean;
  existingValues: string[];
  onCancel: () => void;
  onAdd: (category: ModmailCategoryDraft) => void;
};

const emptyForm: ModmailCategoryDraft = {
  value: "",
  label: "",
  description: "",
};

const VALUE_HELP =
  "Lowercase only. No spaces — use dashes instead (e.g. general-query). Numbers, dashes, and underscores are allowed.";

const VALUE_PATTERN = /^[a-z0-9_-]+$/;
const MAX_VALUE_LEN = 100;
const MAX_LABEL_LEN = 100;
const MAX_DESCRIPTION_LEN = 100;

export function validateModmailCategoryValue(value: string): string | null {
  if (!value) return "Value is required.";
  if (/\s/.test(value)) {
    return "Spaces are not allowed in the value. Use dashes instead.";
  }
  if (/[A-Z]/.test(value)) {
    return "Uppercase letters are not allowed in the value. Use lowercase only.";
  }
  if (!VALUE_PATTERN.test(value)) {
    return "Value may only contain lowercase letters, numbers, dashes, and underscores.";
  }
  if (value.length > MAX_VALUE_LEN) {
    return `Value exceeds ${MAX_VALUE_LEN} characters.`;
  }
  return null;
}

export function AddModmailCategoryModal({
  open,
  existingValues,
  onCancel,
  onAdd,
}: AddModmailCategoryModalProps) {
  const [form, setForm] = useState<ModmailCategoryDraft>(emptyForm);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm(emptyForm);
    setError(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onCancel]);

  function updateField(field: keyof ModmailCategoryDraft, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setError(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const value = form.value.trim();
    const label = form.label.trim();
    const description = form.description.trim();

    const valueError = validateModmailCategoryValue(value);
    if (valueError) {
      setError(valueError);
      return;
    }
    if (!label) {
      setError("Label is required.");
      return;
    }
    if (label.length > MAX_LABEL_LEN) {
      setError(`Label exceeds ${MAX_LABEL_LEN} characters.`);
      return;
    }
    if (description.length > MAX_DESCRIPTION_LEN) {
      setError(`Description exceeds ${MAX_DESCRIPTION_LEN} characters.`);
      return;
    }
    if (existingValues.includes(value)) {
      setError(`Category value "${value}" already exists.`);
      return;
    }

    onAdd({ value, label, description });
  }

  if (!open) return null;

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={onCancel}
    >
      <div
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-modmail-category-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="add-modmail-category-title">Add support category</h3>
        <p>
          This option appears in the DM dropdown. Click Save modmail settings
          afterward to apply changes.
        </p>

        <form className="modal-form" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="add-modmail-value" className="label-with-help">
              Value
              <InfoHelpIcon content={VALUE_HELP} />
            </label>
            <input
              id="add-modmail-value"
              className="input mono"
              value={form.value}
              onChange={(e) => updateField("value", e.target.value)}
              placeholder="e.g. general-query"
              maxLength={MAX_VALUE_LEN}
              autoFocus
            />
          </div>
          <div className="field">
            <label htmlFor="add-modmail-label">Label</label>
            <input
              id="add-modmail-label"
              className="input"
              value={form.label}
              onChange={(e) => updateField("label", e.target.value)}
              placeholder="e.g. General Query"
              maxLength={MAX_LABEL_LEN}
            />
          </div>
          <div className="field">
            <label htmlFor="add-modmail-description">Description</label>
            <input
              id="add-modmail-description"
              className="input"
              value={form.description}
              onChange={(e) => updateField("description", e.target.value)}
              placeholder="Shown under the option in Discord"
              maxLength={MAX_DESCRIPTION_LEN}
            />
          </div>

          {error ? <p className="modal-error">{error}</p> : null}

          <div className="modal-actions">
            <button type="button" className="btn" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Add
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
