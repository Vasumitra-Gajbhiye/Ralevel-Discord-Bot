"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type CategoryOption = { key: string; label: string; categoryId: string };

type CategorySearchMenuProps = {
  categories: CategoryOption[];
  excludeIds?: string[];
  onSelect: (category: CategoryOption) => void;
  emptyMessage?: string;
  searchRef?: React.RefObject<HTMLInputElement | null>;
};

export function CategorySearchMenu({
  categories,
  excludeIds = [],
  onSelect,
  emptyMessage,
  searchRef: externalSearchRef,
}: CategorySearchMenuProps) {
  const [search, setSearch] = useState("");
  const internalSearchRef = useRef<HTMLInputElement>(null);
  const searchRef = externalSearchRef ?? internalSearchRef;

  const availableCategories = useMemo(() => {
    const query = search.trim().toLowerCase();
    return categories.filter((category) => {
      if (!category.categoryId || excludeIds.includes(category.categoryId)) {
        return false;
      }
      if (!query) return true;
      return (
        category.key.toLowerCase().includes(query) ||
        category.label.toLowerCase().includes(query) ||
        category.categoryId.toLowerCase().includes(query)
      );
    });
  }, [categories, excludeIds, search]);

  const resolvedEmptyMessage =
    emptyMessage ??
    (categories.filter(
      (c) => c.categoryId && !excludeIds.includes(c.categoryId),
    ).length === 0
      ? "All categories assigned"
      : "No matching categories");

  useEffect(() => {
    searchRef.current?.focus();
  }, [searchRef]);

  function handleSelect(category: CategoryOption) {
    onSelect(category);
    setSearch("");
  }

  return (
    <div className="role-picker-menu" role="listbox">
      <input
        ref={searchRef}
        className="input role-picker-search"
        type="search"
        placeholder="Search categories…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="role-picker-options">
        {availableCategories.length === 0 ? (
          <p className="role-picker-empty">{resolvedEmptyMessage}</p>
        ) : (
          availableCategories.map((category) => (
            <button
              key={category.key}
              type="button"
              role="option"
              aria-selected={false}
              className="role-picker-option"
              onClick={() => handleSelect(category)}
            >
              <span className="role-picker-option-label">
                {category.label || category.key}
              </span>
              <span className="role-picker-option-key mono">{category.key}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
