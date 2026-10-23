import clsx from "clsx";

export function RiskGauge({
  score,
  category,
}: {
  score: number;
  category: "Low" | "Medium" | "High";
}) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0, Math.min(100, score));
  const color = category === "High" ? "#ef4444" : category === "Medium" ? "#f59e0b" : "#22c55e";

  return (
    <div className="flex flex-col items-center">
      <div className="relative h-36 w-36">
        <svg viewBox="0 0 128 128" className="h-full w-full -rotate-90">
          <circle cx="64" cy="64" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="10" />
          <circle
            cx="64"
            cy="64"
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${(progress / 100) * circumference} ${circumference}`}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-extrabold text-slate-900">{score}</span>
          <span className="text-[0.62rem] font-bold uppercase tracking-wider text-slate-400">
            / 100
          </span>
        </div>
      </div>
      <span
        className={clsx(
          "mt-2 rounded-full px-3 py-1 text-[0.68rem] font-bold uppercase tracking-wider",
          category === "High"
            ? "bg-red-50 text-red-700"
            : category === "Medium"
              ? "bg-amber-50 text-amber-700"
              : "bg-emerald-50 text-emerald-700",
        )}
      >
        {category} risk
      </span>
    </div>
  );
}
