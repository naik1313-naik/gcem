"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";

import type { CountPoint, TimelinePoint } from "@/lib/dashboard";
import type { AlarmLossPoint } from "@/lib/analytics";

const severityColors: Record<string, string> = {
  Critical: "#ef4444",
  High: "#f59e0b",
  Medium: "#06b6d4",
  Low: "#22c55e",
};

const tooltipStyle = {
  borderRadius: 10,
  border: "1px solid #e2e8f0",
  boxShadow: "0 8px 24px -12px rgba(15,23,42,.35)",
  fontSize: 12,
};

export function SeverityChart({ data }: { data: CountPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={250}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
        <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(15,118,110,.05)" }} />
        <Bar dataKey="value" name="Alarms" radius={[7, 7, 0, 0]}>
          {data.map((entry) => (
            <Cell key={entry.name} fill={severityColors[entry.name] ?? "#0f766e"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function TimelineChart({ data }: { data: TimelinePoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={250}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
        <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
        <Tooltip contentStyle={tooltipStyle} />
        <Line
          type="monotone"
          dataKey="count"
          name="Alarms"
          stroke="#0f766e"
          strokeWidth={2.5}
          dot={{ r: 3, fill: "#0f766e" }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function HorizontalBarChart({
  data,
  color = "#0e7490",
  height = 280,
  label = "Count",
}: {
  data: CountPoint[];
  color?: string;
  height?: number;
  label?: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 18, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
        <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
        <YAxis
          type="category"
          dataKey="name"
          width={104}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11 }}
        />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(15,118,110,.05)" }} />
        <Bar dataKey="value" name={label} fill={color} radius={[0, 7, 7, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function LossChart({ data }: { data: { turbine: string; lossKwh: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 8, right: 12, left: -6, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
        <XAxis dataKey="turbine" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
        <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
        <Tooltip contentStyle={tooltipStyle} />
        <Bar dataKey="lossKwh" name="Estimated loss (kWh)" fill="#ef4444" radius={[7, 7, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

const scatterColors: Record<string, string> = {
  Critical: "#ef4444",
  High: "#f59e0b",
  Medium: "#06b6d4",
  Low: "#22c55e",
};

export function IncidentStatusChart({ data }: { data: CountPoint[] }) {
  const colors = ["#14b8a6", "#f59e0b", "#ef4444", "#64748b"];
  return (
    <ResponsiveContainer width="100%" height={250}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius={58}
          outerRadius={88}
          paddingAngle={3}
          stroke="none"
        >
          {data.map((entry, index) => (
            <Cell key={entry.name} fill={colors[index % colors.length]} />
          ))}
        </Pie>
        <Tooltip contentStyle={tooltipStyle} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function MttrTrendChart({ data }: { data: { date: string; hours: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
        <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
        <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
        <Tooltip contentStyle={tooltipStyle} />
        <Line
          type="monotone"
          dataKey="hours"
          name="MTTR (hours)"
          stroke="#0f766e"
          strokeWidth={2.5}
          dot={{ r: 3, fill: "#0f766e" }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function LossScatter({ data }: { data: AlarmLossPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <ScatterChart margin={{ top: 8, right: 18, left: -6, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis
          type="number"
          dataKey="durationMin"
          name="Duration (min)"
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11 }}
        />
        <YAxis
          type="number"
          dataKey="lossKwh"
          name="Loss (kWh)"
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11 }}
        />
        <ZAxis range={[55, 55]} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ strokeDasharray: "3 3" }} />
        <Scatter data={data} name="Alarm">
          {data.map((point) => (
            <Cell key={point.alarmId} fill={scatterColors[point.severity] ?? "#0f766e"} />
          ))}
        </Scatter>
      </ScatterChart>
    </ResponsiveContainer>
  );
}
