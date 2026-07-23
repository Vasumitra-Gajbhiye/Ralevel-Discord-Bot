"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChannelSearchMenu,
  type ChannelOption,
} from "@/components/ChannelSearchMenu";
import { ConfirmModal } from "@/components/ConfirmModal";
import type { IdLabel } from "@/lib/reputationIds";

type ChannelIdPickerProps = {
  channels: ChannelOption[];
  selected: IdLabel[];
  onChange: (selected: IdLabel[]) => void;
  emptyLinkHref?: string;
  emptyLinkLabel?: string;
};

export function ChannelIdPicker({
  channels,
  selected,
  onChange,
  emptyLinkHref = "/settings/channels",
  emptyLinkLabel = "Add channels",
}: ChannelIdPickerProps) {
  const [open, setOpen] = useState(false);
  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selectedIds = useMemo(
    () => selected.map((item) => item.id),
    [selected],
  );

  const pendingItem = pendingRemoveId
    ? selected.find((item) => item.id === pendingRemoveId)
    : null;

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

  function addChannel(channel: ChannelOption) {
    onChange([
      ...selected,
      { id: channel.channelId, label: channel.label || channel.key },
    ]);
  }

  function confirmRemove() {
    if (!pendingRemoveId) return;
    onChange(selected.filter((item) => item.id !== pendingRemoveId));
    setPendingRemoveId(null);
  }

  function toggleOpen() {
    setOpen((prev) => !prev);
  }

  if (channels.length === 0) {
    return (
      <p className="muted" style={{ fontSize: "0.82rem", margin: 0 }}>
        No channels configured.{" "}
        <Link href={emptyLinkHref} style={{ color: "var(--accent)" }}>
          {emptyLinkLabel}
        </Link>
      </p>
    );
  }

  return (
    <>
      <div className="role-picker" ref={containerRef}>
        <div className="role-picker-pills">
          {selected.map((item) => {
            const label = item.label || item.id;
            return (
              <span key={item.id} className="role-pill">
                <span className="role-pill-label">{label}</span>
                <button
                  type="button"
                  className="role-pill-remove"
                  aria-label={`Remove ${label}`}
                  onClick={() => setPendingRemoveId(item.id)}
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
            aria-label="Add channel"
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
          <ChannelSearchMenu
            channels={channels}
            excludeIds={selectedIds}
            onSelect={addChannel}
            searchRef={searchRef}
          />
        ) : null}
      </div>

      <ConfirmModal
        open={pendingRemoveId !== null}
        title="Remove channel"
        message={
          pendingItem
            ? `Remove "${pendingItem.label || pendingItem.id}" from disabled channels? Changes apply after you save.`
            : "Remove this channel from disabled channels?"
        }
        confirmLabel="Remove"
        variant="danger"
        onConfirm={confirmRemove}
        onCancel={() => setPendingRemoveId(null)}
      />
    </>
  );
}
