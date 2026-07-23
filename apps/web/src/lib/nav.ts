export const NAV = [
  { href: "/", label: "Overview" },
  {
    label: "Settings",
    children: [
      { href: "/settings/roles", label: "Roles" },
      { href: "/settings/access", label: "Access" },
      { href: "/settings/commands", label: "Commands" },
      { href: "/settings/channels", label: "Channels" },
      { href: "/settings/category", label: "Categories" },
      { href: "/settings/reputation", label: "Reputation" },
      { href: "/settings/ranks", label: "XP / Ranks" },
      { href: "/settings/welcome", label: "Welcome" },
      { href: "/settings/schedules", label: "Schedules" },
      { href: "/settings/certificates", label: "Certificates" },
      { href: "/settings/confessions", label: "Confessions" },
      { href: "/settings/tasks", label: "Tasks" },
      { href: "/settings/misc", label: "Polls / Sticky / Helper" },
    ],
  },
  {
    label: "Moderation",
    children: [
      { href: "/moderation/warnings", label: "Warnings" },
      { href: "/moderation/notes", label: "Notes" },
      { href: "/moderation/logs", label: "Mod logs" },
    ],
  },
  {
    label: "Operations",
    children: [
      { href: "/ops/certificates", label: "Certificates" },
      { href: "/ops/tasks", label: "Tasks" },
      { href: "/ops/stickies", label: "Stickies" },
      { href: "/ops/confessions", label: "Confessions" },
      { href: "/ops/reputation", label: "Reputation" },
      { href: "/ops/helpers", label: "Helper mappings" },
      { href: "/ops/qotd", label: "QOTD" },
      { href: "/ops/users", label: "Users (XP)" },
      { href: "/ops/polls", label: "Polls" },
    ],
  },
] as const;
