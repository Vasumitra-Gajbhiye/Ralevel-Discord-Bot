"use client";

import { useEffect, useState } from "react";
import { RoleSelect } from "@/components/RoleSelect";
import type { RoleOption } from "@/components/RoleSearchMenu";

type RankDraft = { name: string; roleKey: string; xp: number };

type AddRankModalProps = {
  open: boolean;
  roles: RoleOption[];
  excludeKeys?: string[];
  onCancel: () => void;
  onAdd: (rank: RankDraft) => void;
};

const emptyForm: RankDraft = { name: "", roleKey: "", xp: 0 };

export function AddRankModal({
  open,
  roles,
  excludeKeys = [],
  onCancel,
  onAdd,
}: AddRankModalProps) {
  const [form, setForm] = useState<RankDraft>(emptyForm);
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

  function updateField(field: keyof RankDraft, value: string) {
    setForm((prev) => ({
      ...prev,
      [field]: field === "xp" ? Number(value) || 0 : value,
    }));
    setError(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const name = form.name.trim();
    const roleKey = form.roleKey.trim();

    if (!name) {
      setError("Name is required.");
      return;
    }
    if (!roleKey) {
      setError("Role is required.");
      return;
    }
    if (form.xp < 0) {
      setError("XP threshold must be 0 or greater.");
      return;
    }

    onAdd({ name, roleKey, xp: form.xp });
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
        aria-labelledby="add-rank-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="add-rank-modal-title">Add rank</h3>
        <p>Enter the rank details. Click Add rank to add it to the ladder.</p>

        <form className="modal-form" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="add-rank-name">Name</label>
            <input
              id="add-rank-name"
              className="input"
              value={form.name}
              onChange={(e) => updateField("name", e.target.value)}
              placeholder="e.g. Bronze"
              autoFocus
            />
          </div>
          <div className="field">
            <label>Role</label>
            <RoleSelect
              roles={roles}
              value={form.roleKey}
              excludeKeys={excludeKeys}
              onChange={(roleKey) => updateField("roleKey", roleKey)}
            />
          </div>
          <div className="field">
            <label htmlFor="add-rank-xp">XP threshold</label>
            <input
              id="add-rank-xp"
              className="input"
              type="number"
              min={0}
              value={form.xp}
              onChange={(e) => updateField("xp", e.target.value)}
            />
          </div>

          {error ? <p className="modal-error">{error}</p> : null}

          <div className="modal-actions">
            <button type="button" className="btn" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Add rank
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
