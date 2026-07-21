"use client";

import { useEffect, useState } from "react";

type AccessDraft = { name: string; email: string };

type AddAccessModalProps = {
  open: boolean;
  saving: boolean;
  existingEmails: string[];
  onCancel: () => void;
  onAdd: (entry: AccessDraft) => void | Promise<void>;
};

const emptyForm: AccessDraft = { name: "", email: "" };

export function AddAccessModal({
  open,
  saving,
  existingEmails,
  onCancel,
  onAdd,
}: AddAccessModalProps) {
  const [form, setForm] = useState<AccessDraft>(emptyForm);
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

  function updateField(field: keyof AccessDraft, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const name = form.name.trim();
    const email = form.email.trim().toLowerCase();

    if (!email) {
      setError("Email is required.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Enter a valid email address.");
      return;
    }
    if (existingEmails.includes(email)) {
      setError("This email is already on the allowlist.");
      return;
    }

    await onAdd({ name, email });
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
        aria-labelledby="add-access-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="add-access-modal-title">Add person</h3>
        <p>
          Allow this email to sign up and sign in. Names are for your reference
          only and are not used by Clerk.
        </p>

        <form className="modal-form" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="add-access-name">Name</label>
            <input
              id="add-access-name"
              className="input"
              value={form.name}
              onChange={(e) => updateField("name", e.target.value)}
              placeholder="e.g. Alex Smith"
              autoFocus
              disabled={saving}
            />
          </div>
          <div className="field">
            <label htmlFor="add-access-email">Email</label>
            <input
              id="add-access-email"
              className="input"
              type="email"
              value={form.email}
              onChange={(e) => updateField("email", e.target.value)}
              placeholder="user@example.com"
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
              {saving ? "Adding…" : "Add person"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
