import "server-only";

import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { findDemoAccountByEmail } from "@/lib/demo-accounts";
import { isDemoMode } from "@/lib/demo-mode";
import {
  DEMO_COOKIE,
  verifyDemoSession,
} from "@/lib/demo-session";
import type { DemoDepartment, DemoRole } from "@/lib/demo-types";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export interface AppUser {
  id: string;
  email: string;
  name: string;
  role: DemoRole;
  department: DemoDepartment;
  isDemo: boolean;
}

async function getCookieValue(name: string): Promise<string | null> {
  try {
    const headerList = await headers();
    const cookieHeader = headerList.get("cookie");
    if (!cookieHeader) return null;
    const match = cookieHeader.match(
      new RegExp(`(?:^|; )${encodeURIComponent(name)}=([^;]*)`),
    );
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

export const getCurrentUser = cache(async (): Promise<AppUser | null> => {
  if (isDemoMode()) {
    const token = await getCookieValue(DEMO_COOKIE);
    if (!token) return null;
    const session = verifyDemoSession(token);
    if (!session) return null;
    const account = findDemoAccountByEmail(session.email);
    if (!account) return null;
    return {
      id: account.id,
      email: account.email,
      name: account.name,
      role: account.role,
      department: account.department,
      isDemo: true,
    };
  }

  if (!isSupabaseConfigured) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  return {
    id: user.id,
    email: user.email ?? "",
    name:
      (typeof user.user_metadata?.full_name === "string" && user.user_metadata.full_name) ||
      user.email ||
      "Operator",
    role: "Admin",
    department: "Operations",
    isDemo: false,
  };
});

export async function requireUser(): Promise<AppUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin(): Promise<AppUser> {
  const user = await requireUser();
  if (user.role !== "Admin") redirect("/");
  return user;
}
