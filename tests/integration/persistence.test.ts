import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { afterAll, describe, expect, it } from "vitest";

config({ path: ".env.local", override: true });

const url = process.env.TEST_SUPABASE_URL ?? "";
const anonKey = process.env.TEST_SUPABASE_ANON_KEY ?? "";
const email = process.env.TEST_USER_EMAIL ?? "";
const password = process.env.TEST_USER_PASSWORD ?? "";
const enabled = Boolean(url && anonKey && email && password);

const suffix = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
const turbineId = `TEST-${suffix}`;
const alarmId = `ALM-TEST-${suffix}`;

async function signedClient() {
  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return client;
}

describe.skipIf(!enabled)("persistent Supabase alarm storage", () => {
  afterAll(async () => {
    const client = await signedClient();
    await client.from("alarm_history").delete().eq("alarm_id", alarmId);
    await client.from("turbines").delete().eq("id", turbineId);
  });

  it("creates, filters, updates, and reads an alarm from a second session", async () => {
    const client = await signedClient();

    const { error: turbineError } = await client
      .from("turbines")
      .insert({ id: turbineId, name: "Integration Test Turbine", capacity_kw: 3500 });
    expect(turbineError).toBeNull();

    const timestamp = new Date().toISOString();
    const { error: createError } = await client.from("alarm_history").insert({
      alarm_id: alarmId,
      turbine_id: turbineId,
      alarm_code: "VIB-201",
      description: "Integration test alarm",
      severity: "High",
      timestamp,
      duration_min: 30,
      status: "Active",
      vibration_mm_s: 9.1,
      temperature_c: 72,
      hydraulic_pressure_bar: 168,
      estimated_power_kw: 2400,
      suggested_root_cause: "Drivetrain bearing, gearbox, or rotor imbalance",
      source: "integration-test",
    });
    expect(createError).toBeNull();

    const start = `${timestamp.slice(0, 10)}T00:00:00.000Z`;
    const next = new Date(new Date(start).getTime() + 86_400_000).toISOString();

    const { data: filtered, error: filterError } = await client
      .from("alarm_history")
      .select("alarm_id,status,turbine_id")
      .eq("turbine_id", turbineId)
      .gte("timestamp", start)
      .lt("timestamp", next);
    expect(filterError).toBeNull();
    expect(filtered).toHaveLength(1);
    expect(filtered?.[0].alarm_id).toBe(alarmId);

    const { error: updateError } = await client
      .from("alarm_history")
      .update({
        status: "Resolved",
        technician: "Alex Morgan",
        confirmed_root_cause: "Confirmed test cause",
        resolution_notes: "Integration test resolution",
      })
      .eq("alarm_id", alarmId);
    expect(updateError).toBeNull();

    // A separate client simulates a new browser/session reading persisted data.
    const secondSession = await signedClient();
    const { data: persisted, error: readError } = await secondSession
      .from("alarm_history")
      .select("alarm_id,status,technician,confirmed_root_cause,resolution_notes")
      .eq("alarm_id", alarmId)
      .single();

    expect(readError).toBeNull();
    expect(persisted).toMatchObject({
      alarm_id: alarmId,
      status: "Resolved",
      technician: "Alex Morgan",
      confirmed_root_cause: "Confirmed test cause",
      resolution_notes: "Integration test resolution",
    });

    const { data: audit, error: auditError } = await secondSession
      .from("audit_history")
      .select("id")
      .eq("entity_type", "alarm_history")
      .limit(1);
    expect(auditError).toBeNull();
    expect(audit?.length).toBeGreaterThan(0);
  });
});
