"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CAMBRIDGE_SYLLABUSES,
  getCambridgeSyllabusName,
} from "@ralevel/shared/cambridgeSyllabuses";

type SyllabusCodePickerProps = {
  selected: string[];
  onChange: (codes: string[]) => void;
  /** code -> name of the other subject that already has it (can't be picked). */
  takenBy?: Record<string, string>;
};

const CODE_RE = /^\d{4}$/;

export function SyllabusCodePicker({
  selected,
  onChange,
  takenBy = {},
}: SyllabusCodePickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();

    function onPointerDown(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const query = search.trim().toLowerCase();
  const options = useMemo(
    () =>
      CAMBRIDGE_SYLLABUSES.filter(
        (s) =>
          !selected.includes(s.code) &&
          (!query ||
            s.code.includes(query) ||
            s.name.toLowerCase().includes(query)),
      ),
    [selected, query],
  );
  // Codes missing from the list (new syllabuses, IGCSE …) can still be typed in
  const customCode =
    CODE_RE.test(query) &&
    !selected.includes(query) &&
    !getCambridgeSyllabusName(query)
      ? query
      : null;

  function add(code: string) {
    if (takenBy[code]) return;
    onChange([...selected, code]);
    setSearch("");
  }

  return (
    <div className="role-picker" ref={containerRef}>
      <div className="role-picker-pills">
        {selected.map((code) => {
          const name = getCambridgeSyllabusName(code);
          const label = name ? `${code} ${name}` : code;
          return (
            <span key={code} className="role-pill">
              <span className="role-pill-label">
                <span className="mono">{code}</span>
                {name ? ` ${name}` : null}
              </span>
              <button
                type="button"
                className="role-pill-remove"
                aria-label={`Remove ${label}`}
                onClick={() => onChange(selected.filter((c) => c !== code))}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                  <path
                    d="M3 3l6 6M9 3L3 9"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </span>
          );
        })}
        <button
          type="button"
          className="role-picker-add"
          aria-label="Add syllabus"
          aria-expanded={open}
          onClick={() => setOpen((prev) => !prev)}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path
              d="M7 2.5v9M2.5 7h9"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      {open ? (
        <div className="role-picker-menu" role="listbox">
          <input
            ref={searchRef}
            className="input role-picker-search"
            type="search"
            placeholder="Search code or name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              const pick = customCode ?? (options.length === 1 ? options[0].code : null);
              if (pick) add(pick);
            }}
          />
          <div className="role-picker-options">
            {customCode ? (
              <button
                type="button"
                role="option"
                aria-selected={false}
                className="role-picker-option"
                disabled={Boolean(takenBy[customCode])}
                onClick={() => add(customCode)}
              >
                <span className="role-picker-option-label">Add {customCode}</span>
                <span className="role-picker-option-key">
                  {takenBy[customCode]
                    ? `Already in ${takenBy[customCode]}`
                    : "Not in the Cambridge AS & A Level list"}
                </span>
              </button>
            ) : null}
            {options.length === 0 && !customCode ? (
              <p className="role-picker-empty">
                No matching syllabus. Type a four-digit code to add it anyway.
              </p>
            ) : (
              options.map((s) => {
                const owner = takenBy[s.code];
                return (
                  <button
                    key={s.code}
                    type="button"
                    role="option"
                    aria-selected={false}
                    aria-disabled={Boolean(owner)}
                    className="role-picker-option"
                    disabled={Boolean(owner)}
                    style={owner ? { opacity: 0.55, cursor: "not-allowed" } : undefined}
                    onClick={() => add(s.code)}
                  >
                    <span className="role-picker-option-label">
                      <span className="mono">{s.code}</span> {s.name}
                    </span>
                    {owner ? (
                      <span className="role-picker-option-key">Already in {owner}</span>
                    ) : null}
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
