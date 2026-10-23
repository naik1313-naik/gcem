import { type NextRequest, NextResponse } from "next/server";

import { isDemoMode } from "@/lib/demo-mode";
import { DEMO_COOKIE } from "@/lib/demo-session";
import { updateSession } from "@/lib/supabase/middleware";

function demoRedirect(request: NextRequest, path: string) {
  const url = request.nextUrl.clone();
  url.pathname = path;
  url.search = "";
  return NextResponse.redirect(url);
}

function parseDemoToken(token: string): { email: string; role: string; exp: number } | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const payload = parts[0];
    // Use a simple base64 decode that works in edge runtime
    const binary = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = binary.padEnd(Math.ceil(binary.length / 4) * 4, "=");
    const decoded = atob(padded);
    const parsed = JSON.parse(decoded);
    if (!parsed.email || !parsed.role || !Number.isFinite(parsed.exp)) return null;
    if (parsed.exp < Math.floor(Date.now() / 1000)) return null;
    return { email: parsed.email, role: parsed.role, exp: parsed.exp };
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  if (!isDemoMode()) return updateSession(request);

  const path = request.nextUrl.pathname;
  const token = request.cookies.get(DEMO_COOKIE)?.value;
  const session = token ? parseDemoToken(token) : null;

  if (path === "/login") {
    return session ? demoRedirect(request, "/") : NextResponse.next({ request });
  }

  if (path === "/demo-login") return NextResponse.next({ request });

  if (!session) return demoRedirect(request, "/login");
  if (path.startsWith("/import") && session.role !== "Admin") {
    return demoRedirect(request, "/");
  }

  return NextResponse.next({ request });
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};