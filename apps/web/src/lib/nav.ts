export const CHANNEL_KEYS = [
  { key: "application", label: "Application" },
  { key: "review", label: "Certificate review" },
  { key: "certUpdates", label: "Certificate updates" },
  { key: "graphic", label: "Graphic tasks" },
  { key: "dev", label: "Dev tasks" },
  { key: "writer", label: "Writer tasks" },
  { key: "welcome", label: "Welcome" },
  { key: "modAction", label: "Mod action (confessions)" },
  { key: "vent", label: "Vent / public confessions" },
  { key: "modLog", label: "Moderation logs" },
  { key: "levelUp", label: "Level-up announcements" },
  { key: "qotdReminder", label: "QOTD reminder" },
] as const;

export const FEATURE_KEYS = [
  { key: "reputation", label: "Reputation" },
  { key: "sticky", label: "Sticky messages" },
  { key: "certificates", label: "Certificates" },
  { key: "confessions", label: "Confessions" },
  { key: "tasks", label: "Tasks" },
  { key: "polls", label: "Polls" },
  { key: "welcome", label: "Welcome" },
  { key: "qotd", label: "QOTD" },
  { key: "xpRanks", label: "XP ranks" },
] as const;

export const NAV = [
  { href: "/", label: "Overview" },
  {
    label: "Settings",
    children: [
      { href: "/settings/roles", label: "Roles" },
      { href: "/settings/access", label: "Access" },
      { href: "/settings/commands", label: "Commands" },
      { href: "/settings/channels", label: "Channels" },
      { href: "/settings/reputation", label: "Reputation" },
      { href: "/settings/ranks", label: "XP / Ranks" },
      { href: "/settings/welcome", label: "Welcome" },
      { href: "/settings/features", label: "Features" },
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
