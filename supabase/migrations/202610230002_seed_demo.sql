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
