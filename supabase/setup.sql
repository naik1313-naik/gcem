-- WindSage AI initial schema
-- Apply this file in the Supabase SQL editor or with `supabase db push`.
-- The app uses the anon key plus an authenticated Supabase session only.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.turbines (
  id text primary key,
  name text not null,
  site text,
  model text,
  capacity_kw integer not null default 3500 check (capacity_kw > 0),
  created_at timestamptz not null default now()
);

create table if not exists public.alarm_history (
  id uuid primary key default gen_random_uuid(),
  alarm_id text not null unique,
  turbine_id text not null references public.turbines (id) on delete restrict,
  alarm_code text not null,
  description text not null,
  severity text not null check (severity in ('Critical', 'High', 'Medium', 'Low')),
  "timestamp" timestamptz not null,
  duration_min numeric(10, 2) not null default 0 check (duration_min >= 0),
  status text not null check (status in ('Active', 'Acknowledged', 'Resolved')),
  vibration_mm_s numeric(8, 2),
  temperature_c numeric(8, 2),
  hydraulic_pressure_bar numeric(8, 2),
  estimated_power_kw numeric(10, 2),
  suggested_root_cause text,
  confirmed_root_cause text,
  technician text,
  resolution_notes text,
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.maintenance_incidents (
  id uuid primary key default gen_random_uuid(),
  alarm_id text references public.alarm_history (alarm_id) on delete set null,
  turbine_id text not null references public.turbines (id) on delete restrict,
  title text not null,
  technician text not null default 'Unassigned',
  priority text not null check (priority in ('Critical', 'High', 'Medium', 'Low')),
  due_date date,
  status text not null check (status in ('Open', 'Assigned', 'In Progress', 'Resolved')),
  notes text,
  resolution_summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists public.technician_assignments (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.maintenance_incidents (id) on delete cascade,
  technician text not null,
  assigned_at timestamptz not null default now(),
  unassigned_at timestamptz,
  notes text
);

create table if not exists public.audit_history (
  id bigint generated always as identity primary key,
  entity_type text not null,
  entity_id text not null,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  actor uuid,
  changes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes for search and dashboard queries
-- ---------------------------------------------------------------------------

create index if not exists idx_alarm_timestamp on public.alarm_history ("timestamp" desc);
create index if not exists idx_alarm_turbine_timestamp on public.alarm_history (turbine_id, "timestamp" desc);
create index if not exists idx_alarm_code on public.alarm_history (alarm_code);
create index if not exists idx_alarm_severity on public.alarm_history (severity);
create index if not exists idx_alarm_status on public.alarm_history (status);
create index if not exists idx_alarm_turbine_code on public.alarm_history (turbine_id, alarm_code);
create index if not exists idx_incident_status on public.maintenance_incidents (status);
create index if not exists idx_incident_turbine on public.maintenance_incidents (turbine_id);
create index if not exists idx_incident_alarm on public.maintenance_incidents (alarm_id);
create index if not exists idx_incident_due_date on public.maintenance_incidents (due_date);
create index if not exists idx_assignment_incident on public.technician_assignments (incident_id, assigned_at desc);
create index if not exists idx_audit_entity on public.audit_history (entity_type, entity_id, created_at desc);
create index if not exists idx_audit_created_at on public.audit_history (created_at desc);

-- ---------------------------------------------------------------------------
-- Triggers: updated_at and audit history
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_alarm_updated_at on public.alarm_history;
create trigger set_alarm_updated_at
before update on public.alarm_history
for each row execute function public.set_updated_at();

drop trigger if exists set_incident_updated_at on public.maintenance_incidents;
create trigger set_incident_updated_at
before update on public.maintenance_incidents
for each row execute function public.set_updated_at();

create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_entity_id text;
  v_changes jsonb;
begin
  if tg_op = 'DELETE' then
    v_entity_id := old.id::text;
    v_changes := jsonb_build_object('old', to_jsonb(old));
    insert into public.audit_history (entity_type, entity_id, action, actor, changes)
    values (tg_table_name, v_entity_id, tg_op, auth.uid(), v_changes);
    return old;
  end if;

  v_entity_id := new.id::text;
  v_changes := jsonb_build_object(
    'new', to_jsonb(new),
    'old', case when tg_op = 'UPDATE' then to_jsonb(old) else null end
  );
  insert into public.audit_history (entity_type, entity_id, action, actor, changes)
  values (tg_table_name, v_entity_id, tg_op, auth.uid(), v_changes);
  return new;
end;
$$;

drop trigger if exists audit_alarm_history on public.alarm_history;
create trigger audit_alarm_history
after insert or update or delete on public.alarm_history
for each row execute function public.audit_row_change();

drop trigger if exists audit_maintenance_incidents on public.maintenance_incidents;
create trigger audit_maintenance_incidents
after insert or update or delete on public.maintenance_incidents
for each row execute function public.audit_row_change();

drop trigger if exists audit_technician_assignments on public.technician_assignments;
create trigger audit_technician_assignments
after insert or update or delete on public.technician_assignments
for each row execute function public.audit_row_change();

drop trigger if exists audit_turbines on public.turbines;
create trigger audit_turbines
after insert or update or delete on public.turbines
for each row execute function public.audit_row_change();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- Anonymous users get no access. Any authenticated operator can manage data.
-- Create operators in Supabase Auth and disable public sign-ups.
-- ---------------------------------------------------------------------------

alter table public.turbines enable row level security;
alter table public.alarm_history enable row level security;
alter table public.maintenance_incidents enable row level security;
alter table public.technician_assignments enable row level security;
alter table public.audit_history enable row level security;

drop policy if exists "authenticated_read_turbines" on public.turbines;
create policy "authenticated_read_turbines" on public.turbines
for select to authenticated using (true);

drop policy if exists "authenticated_write_turbines" on public.turbines;
create policy "authenticated_write_turbines" on public.turbines
for insert to authenticated with check (true);

drop policy if exists "authenticated_update_turbines" on public.turbines;
create policy "authenticated_update_turbines" on public.turbines
for update to authenticated using (true) with check (true);

drop policy if exists "authenticated_read_alarms" on public.alarm_history;
create policy "authenticated_read_alarms" on public.alarm_history
for select to authenticated using (true);

drop policy if exists "authenticated_insert_alarms" on public.alarm_history;
create policy "authenticated_insert_alarms" on public.alarm_history
for insert to authenticated with check (true);

drop policy if exists "authenticated_update_alarms" on public.alarm_history;
create policy "authenticated_update_alarms" on public.alarm_history
for update to authenticated using (true) with check (true);

drop policy if exists "authenticated_delete_alarms" on public.alarm_history;
create policy "authenticated_delete_alarms" on public.alarm_history
for delete to authenticated using (true);

drop policy if exists "authenticated_read_incidents" on public.maintenance_incidents;
create policy "authenticated_read_incidents" on public.maintenance_incidents
for select to authenticated using (true);

drop policy if exists "authenticated_insert_incidents" on public.maintenance_incidents;
create policy "authenticated_insert_incidents" on public.maintenance_incidents
for insert to authenticated with check (true);

drop policy if exists "authenticated_update_incidents" on public.maintenance_incidents;
create policy "authenticated_update_incidents" on public.maintenance_incidents
for update to authenticated using (true) with check (true);

drop policy if exists "authenticated_delete_incidents" on public.maintenance_incidents;
create policy "authenticated_delete_incidents" on public.maintenance_incidents
for delete to authenticated using (true);

drop policy if exists "authenticated_read_assignments" on public.technician_assignments;
create policy "authenticated_read_assignments" on public.technician_assignments
for select to authenticated using (true);

drop policy if exists "authenticated_insert_assignments" on public.technician_assignments;
create policy "authenticated_insert_assignments" on public.technician_assignments
for insert to authenticated with check (true);

drop policy if exists "authenticated_update_assignments" on public.technician_assignments;
create policy "authenticated_update_assignments" on public.technician_assignments
for update to authenticated using (true) with check (true);

drop policy if exists "authenticated_read_audit" on public.audit_history;
create policy "authenticated_read_audit" on public.audit_history
for select to authenticated using (true);

-- Explicit grants. Audit rows are written only by the security-definer trigger.
revoke all on public.turbines from anon;
revoke all on public.alarm_history from anon;
revoke all on public.maintenance_incidents from anon;
revoke all on public.technician_assignments from anon;
revoke all on public.audit_history from anon;
grant select, insert, update, delete on public.turbines to authenticated;
grant select, insert, update, delete on public.alarm_history to authenticated;
grant select, insert, update, delete on public.maintenance_incidents to authenticated;
grant select, insert, update, delete on public.technician_assignments to authenticated;
grant select on public.audit_history to authenticated;
-- Optional demo data. Safe to run once after the initial schema.
-- It preserves the seven rows from sample_data/synthetic_alarms.csv and adds
-- nine extra synthetic alarms for a fuller dashboard.

insert into public.turbines (id, name, site, model, capacity_kw) values
  ('WT-01', 'Turbine 01', 'North Ridge', 'WS-3.5', 3500),
  ('WT-02', 'Turbine 02', 'North Ridge', 'WS-3.5', 3500),
  ('WT-03', 'Turbine 03', 'North Ridge', 'WS-3.5', 3500),
  ('WT-04', 'Turbine 04', 'North Ridge', 'WS-3.5', 3500),
  ('WT-05', 'Turbine 05', 'South Mesa', 'WS-3.5', 3500),
  ('WT-06', 'Turbine 06', 'South Mesa', 'WS-3.5', 3500),
  ('WT-07', 'Turbine 07', 'South Mesa', 'WS-3.5', 3500),
  ('WT-08', 'Turbine 08', 'East Point', 'WS-3.5', 3500),
  ('WT-09', 'Turbine 09', 'East Point', 'WS-3.5', 3500),
  ('WT-10', 'Turbine 10', 'East Point', 'WS-3.5', 3500)
on conflict (id) do nothing;

insert into public.alarm_history (
  alarm_id, turbine_id, alarm_code, description, severity, "timestamp",
  duration_min, status, vibration_mm_s, temperature_c, hydraulic_pressure_bar,
  estimated_power_kw, suggested_root_cause, source
) values
  ('ALM-1001', 'WT-03', 'VIB-201', 'Drivetrain vibration above warning threshold', 'Critical', '2026-10-20 06:15:00+00', 190, 'Active', 11.4, 79.0, 165, 1800, 'Drivetrain bearing, gearbox, or rotor imbalance', 'seed'),
  ('ALM-1002', 'WT-03', 'VIB-201', 'Drivetrain vibration above warning threshold', 'High', '2026-10-20 11:45:00+00', 125, 'Active', 10.8, 77.0, 168, 2050, 'Drivetrain bearing, gearbox, or rotor imbalance', 'seed'),
  ('ALM-1003', 'WT-07', 'TMP-310', 'Gearbox oil temperature high', 'High', '2026-10-21 04:20:00+00', 75, 'Acknowledged', 4.2, 94.0, 170, 2600, 'Cooling, lubrication, or gearbox thermal issue', 'seed'),
  ('ALM-1004', 'WT-01', 'COM-101', 'Controller communication timeout', 'Medium', '2026-10-21 08:10:00+00', 25, 'Resolved', 3.1, 68.0, 171, 3000, 'Sensor, network, or controller communication issue', 'seed'),
  ('ALM-1005', 'WT-03', 'HYD-410', 'Hydraulic pressure outside operating band', 'High', '2026-10-22 02:30:00+00', 95, 'Active', 8.6, 81.0, 118, 1600, 'Hydraulic system pressure or leak issue', 'seed'),
  ('ALM-1006', 'WT-05', 'TMP-310', 'Gearbox oil temperature high', 'Medium', '2026-10-22 14:00:00+00', 42, 'Active', 4.8, 87.0, 169, 2450, 'Cooling, lubrication, or gearbox thermal issue', 'seed'),
  ('ALM-1007', 'WT-07', 'COM-101', 'Controller communication timeout', 'Low', '2026-10-23 09:00:00+00', 10, 'Resolved', 3.3, 70.0, 171, 2900, 'Sensor, network, or controller communication issue', 'seed'),
  ('ALM-1008', 'WT-02', 'VIB-201', 'Drivetrain vibration above warning threshold', 'High', '2026-10-19 08:20:00+00', 88, 'Active', 9.2, 74.0, 166, 2150, 'Drivetrain bearing, gearbox, or rotor imbalance', 'seed'),
  ('ALM-1009', 'WT-04', 'HYD-410', 'Hydraulic pressure outside operating band', 'Medium', '2026-10-19 16:40:00+00', 55, 'Acknowledged', 4.1, 72.0, 132, 2700, 'Hydraulic system pressure or leak issue', 'seed'),
  ('ALM-1010', 'WT-06', 'PIT-220', 'Pitch actuator response slow', 'Medium', '2026-10-20 21:10:00+00', 130, 'Active', 5.2, 73.0, 168, 2300, 'Pitch actuator or related control-system issue', 'seed'),
  ('ALM-1011', 'WT-08', 'TMP-310', 'Gearbox oil temperature high', 'High', '2026-10-21 12:30:00+00', 64, 'Acknowledged', 4.5, 92.0, 170, 2500, 'Cooling, lubrication, or gearbox thermal issue', 'seed'),
  ('ALM-1012', 'WT-09', 'VIB-201', 'Drivetrain vibration above warning threshold', 'Low', '2026-10-22 07:50:00+00', 18, 'Resolved', 6.1, 71.0, 169, 3100, 'Drivetrain bearing, gearbox, or rotor imbalance', 'seed'),
  ('ALM-1013', 'WT-03', 'COM-101', 'Controller communication timeout', 'Low', '2026-10-22 19:15:00+00', 12, 'Active', 8.9, 80.0, 172, 1900, 'Sensor, network, or controller communication issue', 'seed'),
  ('ALM-1014', 'WT-10', 'HYD-410', 'Hydraulic pressure outside operating band', 'Medium', '2026-10-23 05:45:00+00', 48, 'Active', 3.8, 69.0, 145, 2950, 'Hydraulic system pressure or leak issue', 'seed'),
  ('ALM-1015', 'WT-02', 'PIT-220', 'Pitch actuator response slow', 'High', '2026-10-23 10:30:00+00', 70, 'Acknowledged', 4.9, 75.0, 160, 2400, 'Pitch actuator or related control-system issue', 'seed'),
  ('ALM-1016', 'WT-04', 'VIB-201', 'Drivetrain vibration above warning threshold', 'Medium', '2026-10-18 13:05:00+00', 35, 'Resolved', 7.4, 72.0, 167, 2800, 'Drivetrain bearing, gearbox, or rotor imbalance', 'seed')
on conflict (alarm_id) do nothing;

with source (alarm_id, title, technician, priority, due_date, status, notes, resolution_summary, created_at, resolved_at) as (
  values
    ('ALM-1001', 'Replace drivetrain bearing set', 'Alex Morgan', 'Critical', '2026-10-24', 'In Progress', 'Vibration at 11.4 mm/s. Bearing inspection scheduled; crane booked.', '', '2026-10-21 08:00:00+00'::timestamptz, null::timestamptz),
    ('ALM-1003', 'Investigate gearbox oil overheating', 'Priya Shah', 'High', '2026-10-26', 'Assigned', 'Cooler fan inspected; oil sample sent to lab.', '', '2026-10-22 09:30:00+00'::timestamptz, null::timestamptz),
    ('ALM-1005', 'Repair hydraulic pressure drop', 'Jordan Lee', 'High', '2026-10-22', 'Open', 'Suspected hose leak near the pitch manifold.', '', '2026-10-22 12:00:00+00'::timestamptz, null::timestamptz),
    ('ALM-1002', 'Pitch system vibration follow-up', 'Field Team A', 'Medium', '2026-10-20', 'Resolved', 'Re-torqued pitch bearing bolts.', 'Re-torque completed; vibration reduced to 4.1 mm/s.', '2026-10-18 10:00:00+00'::timestamptz, '2026-10-22 10:00:00+00'::timestamptz)
)
insert into public.maintenance_incidents (
  alarm_id, turbine_id, title, technician, priority, due_date, status, notes,
  resolution_summary, created_at, resolved_at
)
select s.alarm_id, a.turbine_id, s.title, s.technician, s.priority, s.due_date::date,
       s.status, s.notes, s.resolution_summary, s.created_at, s.resolved_at
from source s
join public.alarm_history a on a.alarm_id = s.alarm_id
where not exists (
  select 1 from public.maintenance_incidents mi where mi.alarm_id = s.alarm_id
);

insert into public.technician_assignments (incident_id, technician, assigned_at, notes)
select mi.id, mi.technician, mi.created_at, 'Initial assignment from demo seed'
from public.maintenance_incidents mi
where mi.technician <> 'Unassigned'
  and not exists (
    select 1 from public.technician_assignments ta where ta.incident_id = mi.id
  );
