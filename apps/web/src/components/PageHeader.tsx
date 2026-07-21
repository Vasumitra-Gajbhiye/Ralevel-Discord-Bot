import type { ReactNode } from "react";

export function RestartBanner() {
  return (
    <div className="restart-banner">
      Settings changes are saved to MongoDB immediately, but the bot only loads
      them on startup. Restart the bot process for settings to take effect.
      Operational data edits apply without a restart.
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
