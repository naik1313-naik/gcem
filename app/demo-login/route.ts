import { type NextRequest, NextResponse } from "next/server";

import { findDemoAccountByEmail } from "@/lib/demo-accounts";
import { isDemoMode } from "@/lib/demo-mode";
import { signDemoSession } from "@/lib/demo-session";
import { DEMO_COOKIE, DEMO_SESSION_HOURS } from "@/lib/demo-session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function redirectTo(request: NextRequest, path: string) {
  return NextResponse.redirect(new URL(path, request.url));
}

export async function GET(request: NextRequest) {
  if (!isDemoMode()) return redirectTo(request, "/login");

  const email = request.nextUrl.searchParams.get("email") ?? "";
  const account = findDemoAccountByEmail(email);
  if (!account) return redirectTo(request, "/login");

  const token = signDemoSession({
    sub: account.id,
    email: account.email,
    name: account.name,
    role: account.role,
    department: account.department,
    exp: Math.floor(Date.now() / 1000) + DEMO_SESSION_HOURS * 60 * 60,
  });

  const response = redirectTo(request, "/");
  response.cookies.set(DEMO_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: DEMO_SESSION_HOURS * 60 * 60,
  });
  return response;
}
