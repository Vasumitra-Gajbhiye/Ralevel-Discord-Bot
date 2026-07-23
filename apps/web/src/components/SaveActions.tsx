"use client";

import type { RefObject } from "react";

type SaveActionsProps = {
  saveBarRef?: RefObject<HTMLDivElement | null>;
  isDirty: boolean;
  saving: boolean;
  onSave: () => void | Promise<void>;
  onDiscard: () => void;
  saveLabel: string;
  className?: string;
};

export function SaveActions({
  saveBarRef,
  isDirty,
  saving,
  onSave,
  onDiscard,
  saveLabel,
  className = "row",
}: SaveActionsProps) {
  return (
    <div ref={saveBarRef} id="save-actions" className={className}>
      {isDirty ? (
        <span className="muted" style={{ fontSize: "0.8rem" }}>
          Unsaved changes
        </span>
      ) : null}
      {isDirty ? (
        <button
          type="button"
          className="btn"
          disabled={saving}
          onClick={onDiscard}
        >
          Discard
        </button>
      ) : null}
      <button
        type="button"
        className="btn btn-primary"
        disabled={!isDirty || saving}
        onClick={onSave}
      >
        {saving ? "Saving…" : saveLabel}
      </button>
    </div>
  );
}
