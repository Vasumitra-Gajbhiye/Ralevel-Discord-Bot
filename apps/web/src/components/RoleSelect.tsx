"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { RoleSearchMenu, type RoleOption } from "@/components/RoleSearchMenu";

type RoleSelectProps = {
  roles: RoleOption[];
  value: string;
  onChange: (key: string) => void;
  excludeKeys?: string[];
  placeholder?: string;
};

export function RoleSelect({
  roles,
  value,
  onChange,
  excludeKeys = [],
  placeholder = "Select role…",
}: RoleSelectProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const roleByKey = useMemo(
    () => Object.fromEntries(roles.map((r) => [r.key, r])),
    [roles],
  );

  const selectedRole = value ? roleByKey[value] : null;
  const displayLabel = selectedRole?.label ?? (value || placeholder);
  const showKey = Boolean(selectedRole);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  function handleSelect(key: string) {
    onChange(key);
    setOpen(false);
  }

  function toggleOpen() {
    setOpen((prev) => !prev);
  }

  if (roles.length === 0) {
    return (
      <p className="muted" style={{ fontSize: "0.82rem", margin: 0 }}>
        No roles configured.{" "}
        <Link href="/settings/roles" style={{ color: "var(--accent)" }}>
          Add roles
        </Link>
      </p>
    );
  }

  return (
    <div className="role-picker role-select" ref={containerRef}>
      <button
        type="button"
        className={`role-select-trigger${value ? "" : " role-select-trigger-empty"}`}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={toggleOpen}
      >
        <span className="role-select-trigger-content">
          <span className="role-select-trigger-label">{displayLabel}</span>
          {showKey ? (
            <span className="role-select-trigger-key mono">{selectedRole!.key}</span>
          ) : null}
        </span>
      </button>

      {open ? (
        <RoleSearchMenu
          roles={roles}
          excludeKeys={excludeKeys}
          onSelect={handleSelect}
          searchRef={searchRef}
        />
      ) : null}
    </div>
  );
}
