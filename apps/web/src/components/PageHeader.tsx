import type { ReactNode } from "react";

export function RestartBanner() {
  return (
    <div className="restart-banner">
      Settings changes are saved to MongoDB immediately. The bot picks them up
      automatically within about 15 seconds — no redeploy or restart needed.
      Operational data edits apply right away.
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div className="page-header-main">
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="page-header-actions">{actions}</div> : null}
    </div>
  );
}
