"use client";

import { useRouter } from "next/navigation";

export function RootCausePicker({
  options,
  selectedId,
}: {
  options: { id: string; label: string }[];
  selectedId: string;
}) {
  const router = useRouter();

  return (
    <div className="analysis-toolbar">
      <label htmlFor="analysisSelect">Incident</label>
      <select
        id="analysisSelect"
        value={selectedId}
        onChange={(event) => {
          router.push(`/root-cause?alarm=${encodeURIComponent(event.target.value)}`);
        }}
      >
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
