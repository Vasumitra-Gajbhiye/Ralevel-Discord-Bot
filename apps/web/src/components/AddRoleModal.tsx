"use client";

import { useEffect, useState } from "react";

type RoleDraft = { key: string; label: string; roleId: string };

type AddRoleModalProps = {
  open: boolean;
  saving: boolean;
  existingKeys: string[];
  onCancel: () => void;
  onAdd: (role: RoleDraft) => void | Promise<void>;
};

const emptyForm: RoleDraft = { key: "", label: "", roleId: "" };

export function AddRoleModal({
  open,
  saving,
  existingKeys,
  onCancel,
  onAdd,
}: AddRoleModalProps) {
  const [form, setForm] = useState<RoleDraft>(emptyForm);
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

  function updateField(field: keyof RoleDraft, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const key = form.key.trim();
    const label = form.label.trim();
    const roleId = form.roleId.trim();

    if (!key) {
      setError("Key is required.");
      return;
    }
    if (!label) {
      setError("Label is required.");
      return;
    }
    if (existingKeys.includes(key)) {
      setError(`Role key "${key}" already exists.`);
      return;
    }

    await onAdd({ key, label, roleId });
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
        aria-labelledby="add-role-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="add-role-modal-title">Add role</h3>
        <p>Enter the role details. Saving adds it to the guild config immediately.</p>

        <form className="modal-form" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="add-role-key">Key</label>
            <input
              id="add-role-key"
              className="input mono"
              value={form.key}
              onChange={(e) => updateField("key", e.target.value)}
              placeholder="e.g. moderator"
              autoFocus
              disabled={saving}
            />
          </div>
          <div className="field">
            <label htmlFor="add-role-label">Label</label>
            <input
              id="add-role-label"
              className="input"
              value={form.label}
              onChange={(e) => updateField("label", e.target.value)}
              placeholder="e.g. Moderator"
              disabled={saving}
            />
          </div>
          <div className="field">
            <label htmlFor="add-role-id">Discord role ID</label>
            <input
              id="add-role-id"
              className="input mono"
              value={form.roleId}
              onChange={(e) => updateField("roleId", e.target.value)}
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
              {saving ? "Adding…" : "Add role"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
