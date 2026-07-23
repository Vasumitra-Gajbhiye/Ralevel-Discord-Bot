"use client";

import { useEffect, useRef, useState } from "react";

type InfoHelpIconProps = {
  content: string;
};

export function InfoHelpIcon({ content }: InfoHelpIconProps) {
  const [hovering, setHovering] = useState(false);
  const [pinned, setPinned] = useState(false);
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const open = hovering || pinned;

  useEffect(() => {
    if (!pinned) return;

    function handlePointerDown(event: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target as Node)
      ) {
        setPinned(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [pinned]);

  return (
    <span
      ref={wrapperRef}
      className="info-help"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <button
        type="button"
        className="info-help-trigger"
        aria-label="More information"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setPinned((prev) => !prev);
        }}
      >
        i
      </button>
      {open ? (
        <span className="info-help-bubble" role="tooltip">
          {content}
        </span>
      ) : null}
    </span>
  );
}
