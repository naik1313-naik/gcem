import clsx from "clsx";

export function MetricCard({
  label,
  value,
  note,
  tone = "teal",
}: {
  label: string;
  value: string | number;
  note?: string;
  tone?: "teal" | "red" | "amber" | "slate" | "blue";
}) {
  const toneClass = {
    teal: "border-l-teal-500",
    red: "border-l-red-500",
    amber: "border-l-amber-500",
    slate: "border-l-slate-400",
    blue: "border-l-sky-500",
  }[tone];

  return (
    <div
      className={clsx(
        "surface min-h-[106px] border-l-4 p-4",
        toneClass,
      )}
    >
      <p className="text-[0.68rem] font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1.5 text-[1.7rem] font-extrabold leading-none text-slate-900">{value}</p>
      {note ? <p className="mt-2 text-[0.7rem] text-slate-500">{note}</p> : null}
    </div>
  );
}
