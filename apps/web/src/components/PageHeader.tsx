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
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="page-header">
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
    </div>
  );
}
