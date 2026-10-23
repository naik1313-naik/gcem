import Link from "next/link";

export default function NotFound() {
  return (
    <main className="windsage-app" style={{ minHeight: "100vh" }}>
      <header className="topbar">
        <div className="brand">
          <div className="mark" aria-hidden="true">
            <svg
              viewBox="0 0 24 24"
              width="22"
              height="22"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
            >
              <circle cx="12" cy="12" r="2.2" />
              <path d="M12 9.8V3.5M13.9 13.1l5.4 3.2M10.1 13.1l-5.4 3.2" />
            </svg>
          </div>
          <div>
            <div className="wordmark">WINDSAGE</div>
            <div className="sitesub">O&amp;M console</div>
          </div>
        </div>
      </header>
      <div className="view" style={{ maxWidth: 720 }}>
        <div className="panel" style={{ marginTop: 40 }}>
          <div className="panel-head">
            <h3>Page not found</h3>
            <span className="hint">404</span>
          </div>
          <div className="panel-body">
            <p style={{ margin: 0, fontSize: 12.5 }}>
              The page or alarm record you requested does not exist.
            </p>
            <div className="action-row" style={{ marginTop: 12 }}>
              <Link href="/" className="btn btn-primary">
                Back to overview
              </Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
