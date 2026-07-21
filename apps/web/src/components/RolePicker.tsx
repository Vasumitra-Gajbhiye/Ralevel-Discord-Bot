"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ConfirmModal } from "@/components/ConfirmModal";
import { RoleSearchMenu, type RoleOption } from "@/components/RoleSearchMenu";

type RolePickerProps = {
  roles: RoleOption[];
  selectedKeys: string[];
  onChange: (keys: string[]) => void;
};

export function RolePicker({ roles, selectedKeys, onChange }: RolePickerProps) {
  const [open, setOpen] = useState(false);
  const [pendingRemoveKey, setPendingRemoveKey] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const roleByKey = useMemo(
    () => Object.fromEntries(roles.map((r) => [r.key, r])),
    [roles],
  );

  const pendingRole = pendingRemoveKey ? roleByKey[pendingRemoveKey] : null;

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

  function addRole(key: string) {
    onChange([...selectedKeys, key]);
  }

  function confirmRemove() {
    if (!pendingRemoveKey) return;
    onChange(selectedKeys.filter((k) => k !== pendingRemoveKey));
    setPendingRemoveKey(null);
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
    <>
      <div className="role-picker" ref={containerRef}>
        <div className="role-picker-pills">
          {selectedKeys.map((key) => {
            const role = roleByKey[key];
            const label = role?.label ?? key;
            return (
              <span key={key} className="role-pill">
                <span className="role-pill-label">{label}</span>
                <button
                  type="button"
                  className="role-pill-remove"
                  aria-label={`Remove ${label}`}
                  onClick={() => setPendingRemoveKey(key)}
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
            );
          })}
          <button
            type="button"
            className="role-picker-add"
            aria-label="Add role"
            aria-expanded={open}
            onClick={toggleOpen}
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

        {open ? (
          <RoleSearchMenu
            roles={roles}
            excludeKeys={selectedKeys}
            onSelect={addRole}
            searchRef={searchRef}
          />
        ) : null}
      </div>

      <ConfirmModal
        open={pendingRemoveKey !== null}
        title="Remove role"
        message={
          pendingRole
            ? `Remove "${pendingRole.label}" from this command?`
            : "Remove this role from the command?"
        }
        confirmLabel="Remove"
        variant="danger"
        onConfirm={confirmRemove}
        onCancel={() => setPendingRemoveKey(null)}
      />
    </>
  );
}
