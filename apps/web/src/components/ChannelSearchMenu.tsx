"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type ChannelOption = { key: string; label: string; channelId: string };

type ChannelSearchMenuProps = {
  channels: ChannelOption[];
  excludeIds?: string[];
  onSelect: (channel: ChannelOption) => void;
  emptyMessage?: string;
  searchRef?: React.RefObject<HTMLInputElement | null>;
};

export function ChannelSearchMenu({
  channels,
  excludeIds = [],
  onSelect,
  emptyMessage,
  searchRef: externalSearchRef,
}: ChannelSearchMenuProps) {
  const [search, setSearch] = useState("");
  const internalSearchRef = useRef<HTMLInputElement>(null);
  const searchRef = externalSearchRef ?? internalSearchRef;

  const availableChannels = useMemo(() => {
    const query = search.trim().toLowerCase();
    return channels.filter((channel) => {
      if (!channel.channelId || excludeIds.includes(channel.channelId)) {
        return false;
      }
      if (!query) return true;
      return (
        channel.key.toLowerCase().includes(query) ||
        channel.label.toLowerCase().includes(query) ||
        channel.channelId.toLowerCase().includes(query)
      );
    });
  }, [channels, excludeIds, search]);

  const resolvedEmptyMessage =
    emptyMessage ??
    (channels.filter((c) => c.channelId && !excludeIds.includes(c.channelId))
      .length === 0
      ? "All channels assigned"
      : "No matching channels");

  useEffect(() => {
    searchRef.current?.focus();
  }, [searchRef]);

  function handleSelect(channel: ChannelOption) {
    onSelect(channel);
    setSearch("");
  }

  return (
    <div className="role-picker-menu" role="listbox">
      <input
        ref={searchRef}
        className="input role-picker-search"
        type="search"
        placeholder="Search channels…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="role-picker-options">
        {availableChannels.length === 0 ? (
          <p className="role-picker-empty">{resolvedEmptyMessage}</p>
        ) : (
          availableChannels.map((channel) => (
            <button
              key={channel.key}
              type="button"
              role="option"
              aria-selected={false}
              className="role-picker-option"
              onClick={() => handleSelect(channel)}
            >
              <span className="role-picker-option-label">
                {channel.label || channel.key}
              </span>
              <span className="role-picker-option-key mono">{channel.key}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
