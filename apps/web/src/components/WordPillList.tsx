"use client";

import { useEffect, useState } from "react";
import { ConfirmModal } from "@/components/ConfirmModal";

type WordPillListProps = {
  label: string;
  description?: string;
  words: string[];
  onChange: (words: string[]) => void;
};

export function WordPillList({
  label,
  description,
  words,
  onChange,
}: WordPillListProps) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [newWord, setNewWord] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [pendingRemoveWord, setPendingRemoveWord] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (!showAddModal) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setShowAddModal(false);
        setNewWord("");
        setAddError(null);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [showAddModal]);

  function openAddModal() {
    setNewWord("");
    setAddError(null);
    setShowAddModal(true);
  }

  function closeAddModal() {
    setShowAddModal(false);
    setNewWord("");
    setAddError(null);
  }

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const word = newWord.trim().toLowerCase();
    if (!word) {
      setAddError("Word is required.");
      return;
    }
    if (words.some((w) => w.toLowerCase() === word)) {
      setAddError("This word is already in the list.");
      return;
    }
    onChange([...words, word]);
    closeAddModal();
  }

  function confirmRemove() {
    if (!pendingRemoveWord) return;
    onChange(words.filter((w) => w !== pendingRemoveWord));
    setPendingRemoveWord(null);
  }

  return (
    <>
      <div className="field">
        <label>{label}</label>
        {description ? (
          <p className="muted" style={{ fontSize: "0.85rem", margin: "0 0 0.5rem" }}>
            {description}
          </p>
        ) : null}
        <div className="role-picker-pills">
          {words.map((word) => (
            <span key={word} className="role-pill">
              <span className="role-pill-label">{word}</span>
              <button
                type="button"
                className="role-pill-remove"
                aria-label={`Remove ${word}`}
                onClick={() => setPendingRemoveWord(word)}
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M3 3l6 6M9 3L3 9"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </span>
          ))}
          <button
            type="button"
            className="role-picker-add"
            aria-label={`Add ${label.toLowerCase()}`}
            onClick={openAddModal}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M7 2.5v9M2.5 7h9"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </div>

      {showAddModal ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={closeAddModal}
        >
          <div
            className="modal-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-word-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="add-word-modal-title">Add word</h3>
            <p>Enter a detection word. It will be matched as a whole word in messages.</p>

            <form className="modal-form" onSubmit={handleAdd}>
              <div className="field">
                <label htmlFor="add-word-input">Word</label>
                <input
                  id="add-word-input"
                  className="input"
                  value={newWord}
                  onChange={(e) => {
                    setNewWord(e.target.value);
                    setAddError(null);
                  }}
                  placeholder="e.g. thanks"
                  autoFocus
                />
              </div>

              {addError ? <p className="modal-error">{addError}</p> : null}

              <div className="modal-actions">
                <button type="button" className="btn" onClick={closeAddModal}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Add word
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <ConfirmModal
        open={pendingRemoveWord !== null}
        title="Remove word"
        message={
          pendingRemoveWord
            ? `Remove "${pendingRemoveWord}"? Changes apply after you save.`
            : ""
        }
        confirmLabel="Remove"
        variant="danger"
        onConfirm={confirmRemove}
        onCancel={() => setPendingRemoveWord(null)}
      />
    </>
  );
}
