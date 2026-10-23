export const DEMO_ROLES = [
  "Admin",
  "Mechanical Engineer",
  "Electrical Engineer",
  "Reliability Engineer",
] as const;

export type DemoRole = (typeof DEMO_ROLES)[number];

export const DEMO_DEPARTMENTS = [
  "Operations",
  "Mechanical",
  "Electrical",
  "Reliability",
] as const;

export type DemoDepartment = (typeof DEMO_DEPARTMENTS)[number];
