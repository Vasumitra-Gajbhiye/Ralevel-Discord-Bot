import { ensureDb, getOrCreateGuildConfig, guildConfigToJson } from "@/lib/db";
import { PageHeader } from "@/components/PageHeader";
import { RestartBanner } from "@/components/PageHeader";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  let stats = {
    warnings: 0,
    certificates: 0,
    tasks: 0,
    stickies: 0,
    confessions: 0,
    users: 0,
    polls: 0,
  };
  let configUpdatedAt = "—";
  let error: string | null = null;

  try {
    const db = await ensureDb();
    const [
      warnings,
      certificates,
      tasks,
      stickies,
      confessions,
      users,
      polls,
      config,
    ] = await Promise.all([
      db.Warning.countDocuments({ active: true }),
      db.Certificate.countDocuments({}),
      db.Task.countDocuments({}),
      db.Sticky.countDocuments({}),
      db.Confession.countDocuments({}),
      db.User.countDocuments({}),
      db.Poll.countDocuments({}),
      getOrCreateGuildConfig(),
    ]);
    stats = {
      warnings,
      certificates,
      tasks,
      stickies,
      confessions,
      users,
      polls,
    };
    const json = guildConfigToJson(config);
    configUpdatedAt = String(
      (json as { updatedAt?: string }).updatedAt || "—",
    );
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load overview";
  }

  return (
    <>
      <PageHeader
        title="Overview"
        description="Single-guild control panel for the r/alevel Discord bot."
      />
      <RestartBanner />
      {error ? (
        <p className="status err">{error}</p>
      ) : (
        <>
          <div className="stats" style={{ marginBottom: "1.25rem" }}>
            {(
              [
                ["Active warnings", stats.warnings, "/moderation/warnings"],
                ["Certificates", stats.certificates, "/ops/certificates"],
                ["Tasks", stats.tasks, "/ops/tasks"],
                ["Stickies", stats.stickies, "/ops/stickies"],
                ["Confessions", stats.confessions, "/ops/confessions"],
                ["Users", stats.users, "/ops/users"],
                ["Polls", stats.polls, "/ops/polls"],
              ] as const
            ).map(([label, value, href]) => (
              <Link key={label} href={href} className="stat">
                <div className="value">{value}</div>
                <div className="label">{label}</div>
              </Link>
            ))}
          </div>
          <div className="card">
            <p className="muted" style={{ margin: 0 }}>
              Guild config last updated:{" "}
              <span className="mono">{configUpdatedAt}</span>
            </p>
            <p className="muted" style={{ margin: "0.5rem 0 0" }}>
              Auth is not enabled yet — treat this dashboard as private network
              only until Clerk is wired up.
            </p>
          </div>
        </>
      )}
    </>
  );
}
