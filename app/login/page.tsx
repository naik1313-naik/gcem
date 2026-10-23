import type { Metadata } from "next";

import { LoginForm } from "@/app/login/login-form";
import { DEMO_ACCOUNTS } from "@/lib/demo-accounts";
import { isDemoMode } from "@/lib/demo-mode";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign in · WindSage",
};

export default function LoginPage() {
  const demoMode = isDemoMode();

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
            <div className="sitesub">
              O&amp;M console &middot; North Ridge wind farm &middot; 10 turbines / 35 MW
            </div>
          </div>
        </div>
        <div className="topbar-right">
          <span className="env-pill">
            <span className="dot" />
            {demoMode ? "Demo dataset" : "Supabase live"}
          </span>
        </div>
      </header>

      <div className="view" style={{ maxWidth: 1100 }}>
        <div className="page-head">
          <div>
            <h1>Sign in to WindSage</h1>
            <p className="page-sub">
              Alarm history, recurrence and maintenance workflow for the North Ridge fleet.
            </p>
          </div>
          <div className="page-meta">
            {demoMode ? "Demo access · no sign-up" : "Authorized operators only"}
          </div>
        </div>

        <div className="grid-2" style={{ alignItems: "start" }}>
          <section className="panel">
            <div className="panel-head">
              <h3>What you get</h3>
              <span className="hint">advisory, human-reviewed</span>
            </div>
            <div className="panel-body">
              <ul className="evidence" style={{ lineHeight: 1.75 }}>
                <li>Fleet overview with estimated loss and capacity impact.</li>
                <li>Incident queue with owner, deadline and work-order notes.</li>
                <li>Recurrence detection across turbine and alarm category.</li>
                <li>DMAIC root-cause workbench with rule-based hypotheses.</li>
                <li>Admin CSV import/export with duplicate detection.</li>
              </ul>
              <div className="note-box" style={{ marginTop: 14 }}>
                {demoMode
                  ? "Demo mode signs you in against an in-memory dataset. Changes reset when the dev server restarts."
                  : "Production mode uses Supabase Auth and PostgreSQL with row-level security. The app never uses a service-role key in the browser."}
              </div>
              <dl className="kv" style={{ marginTop: 14 }}>
                <div>
                  <dt>Site</dt>
                  <dd>North Ridge · 10 turbines · 35 MW</dd>
                </div>
                <div>
                  <dt>Data</dt>
                  <dd>{demoMode ? "Synthetic demo alarms" : "Persistent PostgreSQL"}</dd>
                </div>
                <div>
                  <dt>Access</dt>
                  <dd>{demoMode ? "Admin + department engineers" : "Supabase Auth users"}</dd>
                </div>
              </dl>
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h3>Operator sign-in</h3>
              <span className="hint">{demoMode ? "quick demo access" : "email + password"}</span>
            </div>
            <div className="panel-body">
              {demoMode ? (
                <LoginForm
                  demoMode
                  demoAccounts={DEMO_ACCOUNTS.map((account) => ({
                    id: account.id,
                    email: account.email,
                    password: account.password,
                    name: account.name,
                    role: account.role,
                    department: account.department,
                  }))}
                />
              ) : isSupabaseConfigured ? (
                <LoginForm />
              ) : (
                <div className="note-box">
                  <b>Supabase is not configured.</b>
                  <p style={{ marginTop: 5 }}>
                    Copy <b>.env.example</b> to <b>.env.local</b> and set{" "}
                    <b>NEXT_PUBLIC_SUPABASE_URL</b> and <b>NEXT_PUBLIC_SUPABASE_ANON_KEY</b>.
                  </p>
                </div>
              )}
            </div>
          </section>
        </div>

        <p className="footnote" style={{ maxWidth: 1100 }}>
          Synthetic demo data · rule-based recommendations · human review required. Set{" "}
          <b>DEMO_MODE=false</b> to use Supabase Auth and PostgreSQL.
        </p>
      </div>
    </main>
  );
}
