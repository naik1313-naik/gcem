import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

import { suggestRootCause } from "../lib/alarm-logic";
import { parseAlarmCsv } from "../lib/csv";

config({ path: ".env.local", override: true });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const email = process.env.SEED_USER_EMAIL;
const password = process.env.SEED_USER_PASSWORD;

if (!url || !anonKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  process.exit(1);
}
if (!email || !password) {
  console.error("Missing SEED_USER_EMAIL or SEED_USER_PASSWORD.");
  process.exit(1);
}

const seedEmail: string = email;
const seedPassword: string = password;

const supabase = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function mulberry32(seed: number) {
  return function random() {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const templates = [
  ["VIB-201", "Drivetrain vibration above warning threshold", "High"],
  ["TMP-310", "Gearbox oil temperature high", "High"],
  ["HYD-410", "Hydraulic pressure outside operating band", "Medium"],
  ["COM-101", "Controller communication timeout", "Low"],
  ["PIT-220", "Pitch actuator response slow", "Medium"],
] as const;

function generatedAlarms() {
  const random = mulberry32(14);
  const start = Date.UTC(2026, 8, 24, 0, 0, 0);
  const rows = [];

  for (let index = 0; index < 110; index += 1) {
    const turbine = index % 4 === 0 ? "WT-03" : `WT-${String(1 + Math.floor(random() * 10)).padStart(2, "0")}`;
    const template = templates[index % templates.length];
    const timestamp = new Date(start + (index * 6 + Math.floor(random() * 4)) * 3_600_000);
    const severity =
      turbine === "WT-03" && template[0] === "VIB-201"
        ? random() > 0.4
          ? "Critical"
          : "High"
        : template[2];
    const duration = 12 + Math.floor(random() * 84) + (severity === "Critical" ? 90 : 0);
    const vibration = Number((2 + random() * 4.5 + (template[0] === "VIB-201" ? 3 + random() * 5 : 0)).toFixed(1));
    const temperature = Number((55 + random() * 23 + (template[0] === "TMP-310" ? 10 + random() * 12 : 0)).toFixed(1));
    const pressure = Number((155 + random() * 25 - (template[0] === "HYD-410" ? 35 + random() * 20 : 0)).toFixed(1));
    const power = 1500 + Math.floor(random() * 1800);
    const status = random() < 0.42 ? "Active" : random() < 0.58 ? "Acknowledged" : "Resolved";
    const alarmCode = template[0];

    rows.push({
      alarm_id: `ALM-${2000 + index}`,
      turbine_id: turbine,
      alarm_code: alarmCode,
      description: template[1],
      severity,
      timestamp: timestamp.toISOString(),
      duration_min: duration,
      status,
      vibration_mm_s: vibration,
      temperature_c: temperature,
      hydraulic_pressure_bar: pressure,
      estimated_power_kw: power,
      suggested_root_cause: suggestRootCause({
        alarm_code: alarmCode,
        vibration_mm_s: vibration,
        temperature_c: temperature,
        hydraulic_pressure_bar: pressure,
      }).cause,
      source: "seed-script",
    });
  }

  return rows;
}

async function main() {
  const { error: authError } = await supabase.auth.signInWithPassword({
    email: seedEmail,
    password: seedPassword,
  });
  if (authError) {
    console.error(`Sign-in failed: ${authError.message}`);
    console.error("Create the seed user in Supabase Auth, then set SEED_USER_EMAIL/PASSWORD.");
    process.exit(1);
  }

  const csv = readFileSync(resolve("sample_data/synthetic_alarms.csv"), "utf8");
  const parsed = parseAlarmCsv(csv);
  if (parsed.fatalError) {
    console.error(parsed.fatalError);
    process.exit(1);
  }

  const alarms = [
    ...parsed.rows.map((row) => ({
      ...row,
      suggested_root_cause: suggestRootCause(row).cause,
      source: "csv-seed",
    })),
    ...generatedAlarms(),
  ];

  const turbineIds = [...new Set(alarms.map((alarm) => alarm.turbine_id))];
  const { error: turbineError } = await supabase.from("turbines").upsert(
    turbineIds.map((id) => ({ id, name: id, capacity_kw: 3500 })),
    { onConflict: "id", ignoreDuplicates: true },
  );
  if (turbineError) throw turbineError;

  for (let index = 0; index < alarms.length; index += 100) {
    const batch = alarms.slice(index, index + 100);
    const { error } = await supabase
      .from("alarm_history")
      .upsert(batch, { onConflict: "alarm_id", ignoreDuplicates: true });
    if (error) throw error;
  }

  const incidents = [
    ["ALM-1001", "WT-03", "Replace drivetrain bearing set", "Alex Morgan", "Critical", "2026-10-24", "In Progress", "Vibration at 11.4 mm/s. Bearing inspection scheduled."],
    ["ALM-1003", "WT-07", "Investigate gearbox oil overheating", "Priya Shah", "High", "2026-10-26", "Assigned", "Cooler fan inspected; oil sample sent to lab."],
    ["ALM-1005", "WT-03", "Repair hydraulic pressure drop", "Jordan Lee", "High", "2026-10-22", "Open", "Suspected hose leak near the pitch manifold."],
    ["ALM-1002", "WT-03", "Pitch system vibration follow-up", "Field Team A", "Medium", "2026-10-20", "Resolved", "Re-torqued pitch bearing bolts."],
  ] as const;

  for (const [alarmId, turbineId, title, technician, priority, dueDate, status, notes] of incidents) {
    const { data: existing, error: existingError } = await supabase
      .from("maintenance_incidents")
      .select("id")
      .eq("alarm_id", alarmId)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) continue;

    const { error } = await supabase.from("maintenance_incidents").insert({
      alarm_id: alarmId,
      turbine_id: turbineId,
      title,
      technician,
      priority,
      due_date: dueDate,
      status,
      notes,
      resolution_summary: status === "Resolved" ? "Re-torque completed; vibration reduced." : null,
      resolved_at: status === "Resolved" ? "2026-10-22T10:00:00Z" : null,
    });
    if (error) throw error;
  }

  const { data: assignments, error: assignmentError } = await supabase
    .from("maintenance_incidents")
    .select("id,technician")
    .neq("technician", "Unassigned");
  if (assignmentError) throw assignmentError;

  if (assignments?.length) {
    const { data: existingAssignments, error: readError } = await supabase
      .from("technician_assignments")
      .select("incident_id");
    if (readError) throw readError;
    const existingIds = new Set((existingAssignments ?? []).map((row) => row.incident_id));
    const missing = assignments
      .filter((row) => !existingIds.has(row.id))
      .map((row) => ({
        incident_id: row.id,
        technician: row.technician,
        notes: "Initial assignment from seed script",
      }));
    if (missing.length) {
      const { error } = await supabase.from("technician_assignments").insert(missing);
      if (error) throw error;
    }
  }

  console.log(`Seed complete: ${alarms.length} alarms upserted and ${incidents.length} demo work orders checked.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
