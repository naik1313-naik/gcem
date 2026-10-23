"use client";

import clsx from "clsx";
import {
  BellRing,
  ChartNoAxesCombined,
  LayoutDashboard,
  LogOut,
  Menu,
  Sparkles,
  Upload,
  Wind,
  Wrench,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { logoutAction } from "@/app/login/actions";

const links = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/alarms", label: "Alarm Center", icon: BellRing },
  { href: "/insights", label: "AI Insights", icon: Sparkles },
  { href: "/maintenance", label: "Maintenance", icon: Wrench },
  { href: "/analytics", label: "LPF Analytics", icon: ChartNoAxesCombined },
  { href: "/import", label: "Import / Export", icon: Upload },
];

function Navigation({
  canImport,
  onNavigate,
}: {
  canImport: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav className="space-y-1">
      {links
        .filter((link) => link.href !== "/import" || canImport)
        .map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={clsx(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition",
              active
                ? "bg-teal-400/15 text-teal-200 ring-1 ring-inset ring-teal-300/20"
                : "text-slate-300 hover:bg-white/5 hover:text-white",
            )}
          >
            <Icon className="h-[18px] w-[18px]" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-teal-300 to-cyan-500 text-navy-950 shadow-lg shadow-teal-500/20">
        <Wind className="h-5 w-5" />
      </span>
      <div>
        <p className="text-base font-extrabold tracking-tight text-white">WindSage AI</p>
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-teal-300/80">
          Alarm intelligence
        </p>
      </div>
    </div>
  );
}

function SidebarBody({
  email,
  name,
  role,
  department,
  demoMode,
  canImport,
  onNavigate,
}: {
  email: string;
  name: string;
  role: string;
  department: string;
  demoMode: boolean;
  canImport: boolean;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex h-full flex-col px-4 py-5">
      <Brand />
      <div className="mt-8">
        <p className="mb-3 px-3 text-[0.62rem] font-bold uppercase tracking-[0.18em] text-slate-500">
          Operations
        </p>
        <Navigation canImport={canImport} onNavigate={onNavigate} />
      </div>
      <div className="mt-auto space-y-4">
        <div className="rounded-xl border border-teal-300/15 bg-teal-400/5 p-3">
          <p className="flex items-center gap-2 text-[0.68rem] font-bold uppercase tracking-wider text-teal-300">
            <span className="h-1.5 w-1.5 rounded-full bg-teal-300" />
            {demoMode ? "Demo mode" : "Supabase connected"}
          </p>
          <p className="mt-1.5 text-[0.68rem] leading-5 text-slate-400">
            {demoMode
              ? "In-memory demo data · resets on server restart"
              : "Persistent PostgreSQL · advisory rules only"}
          </p>
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-white/10 pt-4">
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-slate-200">{name || email || "Operator"}</p>
            <p className="truncate text-[0.62rem] text-slate-500">
              {role} · {department}
            </p>
          </div>
          <form action={logoutAction as unknown as (fd: FormData) => Promise<void>}>
            <button
              type="submit"
              title="Sign out"
              className="rounded-lg p-2 text-slate-400 transition hover:bg-white/5 hover:text-white"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export function Sidebar({
  email,
  name,
  role,
  department,
  demoMode,
  canImport,
}: {
  email: string;
  name: string;
  role: string;
  department: string;
  demoMode: boolean;
  canImport: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-30 flex h-16 items-center justify-between border-b border-white/10 bg-navy-950 px-4 lg:hidden">
        <Brand />
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-lg p-2 text-slate-200 hover:bg-white/10"
          aria-label="Open navigation"
        >
          <Menu className="h-5 w-5" />
        </button>
      </header>

      {open ? (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-navy-950/60 backdrop-blur-sm lg:hidden"
        />
      ) : null}

      <aside
        className={clsx(
          "fixed inset-y-0 left-0 z-50 w-64 transform bg-navy-950 transition-transform duration-200 lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="absolute right-3 top-4 rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white lg:hidden"
          aria-label="Close navigation"
        >
          <X className="h-4 w-4" />
        </button>
        <SidebarBody
          email={email}
          name={name}
          role={role}
          department={department}
          demoMode={demoMode}
          canImport={canImport}
          onNavigate={() => setOpen(false)}
        />
      </aside>
    </>
  );
}
