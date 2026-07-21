"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type RoleOption = { key: string; label: string };

type RoleSearchMenuProps = {
  roles: RoleOption[];
  excludeKeys?: string[];
  onSelect: (key: string) => void;
  emptyMessage?: string;
  searchRef?: React.RefObject<HTMLInputElement | null>;
};

export function RoleSearchMenu({
  roles,
  excludeKeys = [],
  onSelect,
  emptyMessage,
  searchRef: externalSearchRef,
}: RoleSearchMenuProps) {
  const [search, setSearch] = useState("");
  const internalSearchRef = useRef<HTMLInputElement>(null);
  const searchRef = externalSearchRef ?? internalSearchRef;

  const availableRoles = useMemo(() => {
    const query = search.trim().toLowerCase();
    return roles.filter((role) => {
      if (excludeKeys.includes(role.key)) return false;
      if (!query) return true;
      return (
        role.key.toLowerCase().includes(query) ||
        role.label.toLowerCase().includes(query)
      );
    });
  }, [roles, excludeKeys, search]);

  const resolvedEmptyMessage =
    emptyMessage ??
    (roles.length === excludeKeys.length
      ? "All roles assigned"
      : "No matching roles");

  useEffect(() => {
    searchRef.current?.focus();
  }, [searchRef]);

  function handleSelect(key: string) {
    onSelect(key);
    setSearch("");
  }

  return (
    <div className="role-picker-menu" role="listbox">
      <input
        ref={searchRef}
        className="input role-picker-search"
        type="search"
        placeholder="Search roles…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="role-picker-options">
        {availableRoles.length === 0 ? (
          <p className="role-picker-empty">{resolvedEmptyMessage}</p>
        ) : (
          availableRoles.map((role) => (
            <button
              key={role.key}
              type="button"
              role="option"
              aria-selected={false}
              className="role-picker-option"
              onClick={() => handleSelect(role.key)}
            >
              <span className="role-picker-option-label">{role.label}</span>
              <span className="role-picker-option-key mono">{role.key}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
