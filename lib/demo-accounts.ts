import { timingSafeEqual } from "node:crypto";

import type { DemoDepartment, DemoRole } from "@/lib/demo-types";

export interface DemoAccount {
  id: string;
  email: string;
  password: string;
  name: string;
  role: DemoRole;
  department: DemoDepartment;
}

export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    id: "demo-admin",
    email: "admin@windsage.demo",
    password: "Admin@123",
    name: "Demo Admin",
    role: "Admin",
    department: "Operations",
  },
  {
    id: "demo-mechanical",
    email: "mechanical@windsage.demo",
    password: "Mechanical@123",
    name: "Ravi Mechanical",
    role: "Mechanical Engineer",
    department: "Mechanical",
  },
  {
    id: "demo-electrical",
    email: "electrical@windsage.demo",
    password: "Electrical@123",
    name: "Neha Electrical",
    role: "Electrical Engineer",
    department: "Electrical",
  },
  {
    id: "demo-reliability",
    email: "reliability@windsage.demo",
    password: "Reliability@123",
    name: "Arjun Reliability",
    role: "Reliability Engineer",
    department: "Reliability",
  },
];

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function findDemoAccount(email: string, password: string): DemoAccount | null {
  const normalized = email.trim().toLowerCase();
  return (
    DEMO_ACCOUNTS.find(
      (account) =>
        account.email.toLowerCase() === normalized && safeEqual(account.password, password),
    ) ?? null
  );
}

export function findDemoAccountByEmail(email: string): DemoAccount | null {
  const normalized = email.trim().toLowerCase();
  return DEMO_ACCOUNTS.find((account) => account.email.toLowerCase() === normalized) ?? null;
}
