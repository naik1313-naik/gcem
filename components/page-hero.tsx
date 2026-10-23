import type { LucideIcon } from "lucide-react";

export function PageHero({
  eyebrow,
  title,
  subtitle,
  icon: Icon,
  badge,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  badge?: string;
}) {
  return (
    <section className="hero-grid relative mb-5 overflow-hidden rounded-2xl px-5 py-6 text-white shadow-lg shadow-navy-950/10 sm:px-7 sm:py-7">
      <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="mt-0.5 hidden rounded-xl bg-white/10 p-2.5 ring-1 ring-inset ring-white/15 sm:block">
            <Icon className="h-5 w-5 text-teal-200" />
          </span>
          <div>
            <p className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-teal-300">
              {eyebrow}
            </p>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight sm:text-[1.7rem]">{title}</h1>
            <p className="mt-1.5 max-w-2xl text-sm leading-6 text-cyan-50/80">{subtitle}</p>
          </div>
        </div>
        {badge ? (
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-teal-300/25 bg-teal-300/10 px-3 py-1.5 text-[0.68rem] font-bold uppercase tracking-wider text-teal-200">
            <span className="h-1.5 w-1.5 rounded-full bg-teal-300" />
            {badge}
          </span>
        ) : null}
      </div>
    </section>
  );
}
