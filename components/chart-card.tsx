export function ChartCard({
  title,
  subtitle,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`surface p-5 ${className ?? ""}`}>
      <div className="mb-3">
        <h2 className="text-sm font-bold text-slate-800">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-[0.68rem] text-slate-400">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}
