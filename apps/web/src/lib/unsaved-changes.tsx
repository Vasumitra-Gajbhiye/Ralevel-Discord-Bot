"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { usePathname } from "next/navigation";
import { toast } from "sonner";

const BLOCKED_NAV_MESSAGE =
  "You have unsaved changes. Save or discard before leaving this page.";

export function isDraftDirty<T>(draft: T | null, saved: T): boolean {
  return draft !== null && JSON.stringify(draft) !== JSON.stringify(saved);
}

type UnsavedRegistration = {
  isDirty: boolean;
  onDiscard: () => void;
  saveBarRef: RefObject<HTMLElement | null>;
};

type UnsavedChangesContextValue = {
  register: (registration: UnsavedRegistration) => () => void;
};

const UnsavedChangesContext = createContext<UnsavedChangesContextValue | null>(
  null,
);

function highlightSaveBar(ref: RefObject<HTMLElement | null>) {
  const el = ref.current ?? document.getElementById("save-actions");
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.setAttribute("data-highlight", "true");
  window.setTimeout(() => el.removeAttribute("data-highlight"), 1500);
}

export function UnsavedChangesProvider({
  children,
  shellRef,
}: {
  children: React.ReactNode;
  shellRef: RefObject<HTMLElement | null>;
}) {
  const pathname = usePathname();
  const registrationRef = useRef<UnsavedRegistration | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const historyGuardPushed = useRef(false);

  const notifyBlockedNavigation = useCallback(() => {
    const registration = registrationRef.current;
    if (registration?.saveBarRef) {
      highlightSaveBar(registration.saveBarRef);
    }
    toast.error(BLOCKED_NAV_MESSAGE);
  }, []);

  const register = useCallback((next: UnsavedRegistration) => {
    registrationRef.current = next;
    setIsDirty((prev) => (prev === next.isDirty ? prev : next.isDirty));
    return () => {
      registrationRef.current = null;
      setIsDirty(false);
    };
  }, []);

  useEffect(() => {
    if (!isDirty || !shellRef.current) return;

    function handleClick(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const anchor = target.closest("a[href]");
      if (!anchor || !(anchor instanceof HTMLAnchorElement)) return;

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || anchor.target === "_blank") return;

      let url: URL;
      try {
        url = new URL(href, window.location.origin);
      } catch {
        return;
      }

      if (url.origin !== window.location.origin) return;
      if (url.pathname === pathname) return;

      event.preventDefault();
      event.stopPropagation();
      notifyBlockedNavigation();
    }

    const shell = shellRef.current;
    shell.addEventListener("click", handleClick, true);
    return () => shell.removeEventListener("click", handleClick, true);
  }, [isDirty, notifyBlockedNavigation, pathname, shellRef]);

  useEffect(() => {
    if (!isDirty) return;

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  useEffect(() => {
    if (!isDirty) {
      historyGuardPushed.current = false;
      return;
    }

    if (!historyGuardPushed.current) {
      window.history.pushState({ unsavedGuard: true }, "", window.location.href);
      historyGuardPushed.current = true;
    }

    function handlePopState() {
      window.history.pushState(
        { unsavedGuard: true },
        "",
        window.location.href,
      );
      notifyBlockedNavigation();
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [isDirty, notifyBlockedNavigation]);

  const value = useMemo(
    () => ({ register }),
    [register],
  );

  return (
    <UnsavedChangesContext.Provider value={value}>
      {children}
    </UnsavedChangesContext.Provider>
  );
}

export function useUnsavedChanges({
  isDirty,
  onDiscard,
}: {
  isDirty: boolean;
  onDiscard: () => void;
}) {
  const context = useContext(UnsavedChangesContext);
  if (!context) {
    throw new Error("useUnsavedChanges must be used within UnsavedChangesProvider");
  }

  const { register } = context;

  const saveBarRef = useRef<HTMLDivElement>(null);
  const onDiscardRef = useRef(onDiscard);
  onDiscardRef.current = onDiscard;

  useEffect(() => {
    return register({
      isDirty,
      onDiscard: () => onDiscardRef.current(),
      saveBarRef,
    });
  }, [register, isDirty]);

  return { saveBarRef };
}
