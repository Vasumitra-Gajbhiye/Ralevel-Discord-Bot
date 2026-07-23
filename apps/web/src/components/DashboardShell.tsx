"use client";

import { useRef } from "react";
import { useTheme } from "next-themes";
import { Toaster } from "sonner";
import { Sidebar } from "@/components/Sidebar";
import { UnsavedChangesProvider } from "@/lib/unsaved-changes";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const shellRef = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();

  return (
    <UnsavedChangesProvider shellRef={shellRef}>
      <div ref={shellRef} className="dashboard-shell">
        <Sidebar />
        <main className="main">{children}</main>
        <Toaster
          richColors
          closeButton
          position="bottom-center"
          theme={resolvedTheme === "dark" ? "dark" : "light"}
        />
      </div>
    </UnsavedChangesProvider>
  );
}
