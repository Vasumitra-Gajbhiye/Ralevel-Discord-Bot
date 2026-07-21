"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <button type="button" className="btn btn-sm theme-toggle" disabled>
        Theme
      </button>
    );
  }

  const isDark = (resolvedTheme ?? theme) === "dark";

  return (
    <button
      type="button"
      className="btn btn-sm theme-toggle"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {isDark ? "Light mode" : "Dark mode"}
    </button>
  );
}
