"use client";

import { useEffect, useState } from "react";
import type { IdLabel } from "@/lib/reputationIds";

type AddLabeledIdModalProps = {
  open: boolean;
  title: string;
  idLabel: string;
  existingIds: string[];
  onCancel: () => void;
  onAdd: (entry: IdLabel) => void;
};

const emptyForm: IdLabel = { id: "", label: "" };

export function AddLabeledIdModal({
  open,
  title,
  idLabel,
  existingIds,
  onCancel,
  onAdd,
}: AddLabeledIdModalProps) {
  const [form, setForm] = useState<IdLabel>(emptyForm);
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

  function updateField(field: keyof IdLabel, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setError(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const id = form.id.trim();
    const label = form.label.trim();

    if (!id) {
      setError(`${idLabel} is required.`);
      return;
    }
    if (!/^\d{17,20}$/.test(id)) {
      setError("ID should be a Discord snowflake (17–20 digits).");
      return;
    }
    if (existingIds.includes(id)) {
      setError("This ID is already in the list.");
      return;
    }

    onAdd({ id, label });
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
        aria-labelledby="add-labeled-id-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="add-labeled-id-modal-title">{title}</h3>
        <p>Add a display name and Discord snowflake ID.</p>

        <form className="modal-form" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="add-labeled-id-name">Display name</label>
            <input
              id="add-labeled-id-name"
              className="input"
              value={form.label}
              onChange={(e) => updateField("label", e.target.value)}
              placeholder="e.g. #off-topic"
              autoFocus
            />
          </div>
          <div className="field">
            <label htmlFor="add-labeled-id-id">{idLabel}</label>
            <input
              id="add-labeled-id-id"
              className="input mono"
              value={form.id}
              onChange={(e) => updateField("id", e.target.value)}
              placeholder="Snowflake ID"
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
