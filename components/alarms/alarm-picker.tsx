import Link from "next/link";

import type { AlarmRecord } from "@/lib/types";

export function AlarmPicker({
  alarms,
  selectedId,
  action,
}: {
  alarms: AlarmRecord[];
  selectedId: string;
  action: string;
}) {
  return (
    <form method="get" action={action} className="surface flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
      <div className="min-w-0 flex-1">
        <label className="label" htmlFor="alarm-picker">
          Select an alarm
        </label>
        <select id="alarm-picker" name="alarm" defaultValue={selectedId} className="field">
          {alarms.map((alarm) => (
            <option key={alarm.alarm_id} value={alarm.alarm_id}>
              {alarm.alarm_id} · {alarm.turbine_id} · {alarm.alarm_code} · {alarm.severity}
            </option>
          ))}
        </select>
      </div>
      <button type="submit" className="btn-primary">
        Load alarm
      </button>
      <Link href="/alarms" className="btn-secondary">
        Search alarms
      </Link>
    </form>
  );
}
