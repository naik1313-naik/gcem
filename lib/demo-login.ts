import { findDemoAccountByEmail } from "@/lib/demo-accounts";
import {
  DEMO_COOKIE,
  DEMO_SESSION_HOURS,
  signDemoSession,
} from "@/lib/demo-session";

// Note: This helper is kept for reference but is no longer used by the
// demo-login route handler, which sets cookies via NextResponse.cookies.set()
// to avoid the hanging cookies() API from next/headers in this environment.
export async function startDemoSession(email: string): Promise<boolean> {
  const account = findDemoAccountByEmail(email);
  if (!account) return false;

  const token = signDemoSession({
    sub: account.id,
    email: account.email,
    name: account.name,
    role: account.role,
    department: account.department,
    exp: Math.floor(Date.now() / 1000) + DEMO_SESSION_HOURS * 60 * 60,
  });

  // cookies() from next/headers hangs in this environment.
  // Callers should use NextResponse.cookies.set() instead.
  return true;
}
