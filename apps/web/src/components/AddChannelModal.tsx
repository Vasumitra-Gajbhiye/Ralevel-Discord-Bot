"use client";

import { useEffect, useState } from "react";

type ChannelDraft = { key: string; label: string; channelId: string };

type AddChannelModalProps = {
  open: boolean;
  saving: boolean;
  existingKeys: string[];
  onCancel: () => void;
  onAdd: (channel: ChannelDraft) => void | Promise<void>;
};

const emptyForm: ChannelDraft = { key: "", label: "", channelId: "" };

export function AddChannelModal({
  open,
  saving,
  existingKeys,
  onCancel,
  onAdd,
}: AddChannelModalProps) {
  const [form, setForm] = useState<ChannelDraft>(emptyForm);
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

  function updateField(field: keyof ChannelDraft, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const key = form.key.trim();
    const label = form.label.trim();
    const channelId = form.channelId.trim();

    if (!key) {
      setError("Key is required.");
      return;
    }
    if (!label) {
      setError("Label is required.");
      return;
    }
    if (existingKeys.includes(key)) {
      setError(`Channel key "${key}" already exists.`);
      return;
    }

    await onAdd({ key, label, channelId });
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
        aria-labelledby="add-channel-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="add-channel-modal-title">Add channel</h3>
        <p>
          Enter the channel details. Saving adds it to the guild config when
          you click Save channels.
        </p>

        <form className="modal-form" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="add-channel-key">Key</label>
            <input
              id="add-channel-key"
              className="input mono"
              value={form.key}
              onChange={(e) => updateField("key", e.target.value)}
              placeholder="e.g. welcome"
              autoFocus
              disabled={saving}
            />
          </div>
          <div className="field">
            <label htmlFor="add-channel-label">Label</label>
            <input
              id="add-channel-label"
              className="input"
              value={form.label}
              onChange={(e) => updateField("label", e.target.value)}
              placeholder="e.g. Welcome"
              disabled={saving}
            />
          </div>
          <div className="field">
            <label htmlFor="add-channel-id">Discord channel ID</label>
            <input
              id="add-channel-id"
              className="input mono"
              value={form.channelId}
              onChange={(e) => updateField("channelId", e.target.value)}
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
