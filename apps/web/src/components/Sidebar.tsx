"use client";

import { UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { NAV } from "@/lib/nav";

function findSectionForPath(pathname: string): string | null {
  for (const section of NAV) {
    if ("children" in section) {
      if (section.children.some((item) => item.href === pathname)) {
        return section.label;
      }
    }
  }
  return null;
}

export function Sidebar() {
  const pathname = usePathname();
  const [expandedSection, setExpandedSection] = useState<string | null>(() =>
    findSectionForPath(pathname),
  );

  useEffect(() => {
    setExpandedSection(findSectionForPath(pathname));
  }, [pathname]);

  function toggleSection(label: string) {
    setExpandedSection((current) => (current === label ? null : label));
  }

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

        const isExpanded = expandedSection === section.label;
        const sectionId = `nav-section-${section.label.toLowerCase()}`;

        return (
          <div
            className="nav-section"
            key={section.label}
            data-expanded={isExpanded ? "true" : "false"}
          >
            <button
              type="button"
              className="nav-section-toggle"
              aria-expanded={isExpanded}
              aria-controls={sectionId}
              onClick={() => toggleSection(section.label)}
            >
              <span className="nav-section-chevron" aria-hidden="true">
                ›
              </span>
              {section.label}
            </button>
            <div className="nav-section-children" id={sectionId}>
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
          </div>
        );
      })}
      <div className="sidebar-footer">
        <UserButton />
      </div>
    </aside>
  );
}
