"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { resetDemoDataAction } from "@/app/(dashboard)/console-actions";
import { logoutAction } from "@/app/login/actions";
import { formatClock } from "@/lib/console";

const tabs = [
  { href: "/", label: "Overview" },
  { href: "/incidents", label: "Incidents" },
  { href: "/recurrence", label: "Recurrence" },
  { href: "/root-cause", label: "Root cause" },
  { href: "/import", label: "Import / Export", adminOnly: true },
];

export function ConsoleHeader({
  name,
  email,
  role,
  demoMode,
  canImport,
}: {
  name: string;
  email: string;
  role: string;
  demoMode: boolean;
  canImport: boolean;
}) {
  const pathname = usePathname();
  const [clock, setClock] = useState("");

  useEffect(() => {
    const tick = () => setClock(formatClock(new Date()));
    tick();
    const timer = window.setInterval(tick, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <>
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
          <span className="clock" suppressHydrationWarning>
            {clock}
          </span>
          {demoMode ? (
            <form action={resetDemoDataAction}>
              <button className="btn btn-ghost btn-sm" type="submit">
                Reset data
              </button>
            </form>
          ) : null}
          <div className="console-user" title={email}>
            <span className="console-user-name">{name || email || "Operator"}</span>
            <span className="console-user-role">{role}</span>
          </div>
          <form action={logoutAction as unknown as (fd: FormData) => Promise<void>}>
            <button className="btn btn-ghost btn-sm" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </header>

      <nav className="tabs" aria-label="Sections">
        {tabs
          .filter((tab) => !tab.adminOnly || canImport)
          .map((tab) => {
            const active =
              tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={active ? "tab active" : "tab"}
              >
                {tab.label}
              </Link>
            );
          })}
      </nav>
    </>
  );
}
