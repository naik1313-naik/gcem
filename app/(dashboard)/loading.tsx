export default function DashboardLoading() {
  return (
    <div className="console-loading" aria-label="Loading console">
      <div className="page-head">
        <div>
          <div className="skeleton skeleton-title" />
          <div className="skeleton skeleton-sub" />
        </div>
      </div>
      <div className="kpis">
        {Array.from({ length: 5 }).map((_, index) => (
          <div className="kpi" key={index}>
            <div className="skeleton skeleton-label" />
            <div className="skeleton skeleton-value" />
            <div className="skeleton skeleton-sub" />
          </div>
        ))}
      </div>
      <div className="grid-2">
        <div className="panel" style={{ height: 280 }} />
        <div className="panel" style={{ height: 280 }} />
      </div>
      <div className="panel" style={{ height: 240 }} />
    </div>
  );
}
