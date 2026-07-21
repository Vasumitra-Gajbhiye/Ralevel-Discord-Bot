"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV } from "@/lib/nav";

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <h1>r/alevel</h1>
        <p>Bot control dashboard</p>
      </div>
      {NAV.map((section) => {
        if ("href" in section) {
          return (
            <div className="nav-section" key={section.href}>
              <Link
                href={section.href}
                className="nav-link"
                data-active={pathname === section.href ? "true" : "false"}
              >
                {section.label}
              </Link>
            </div>
          );
        }
        return (
          <div className="nav-section" key={section.label}>
            <div className="nav-section-label">{section.label}</div>
            {section.children.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="nav-link"
                data-active={pathname === item.href ? "true" : "false"}
              >
                {item.label}
              </Link>
            ))}
          </div>
        );
      })}
    </aside>
  );
}
