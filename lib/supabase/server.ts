import "server-only";

import { createServerClient } from "@supabase/ssr";
import { headers } from "next/headers";

import { SUPABASE_ANON_KEY, SUPABASE_URL, assertSupabaseConfigured } from "@/lib/supabase/config";

export async function createClient() {
  assertSupabaseConfigured();
  const headerList = await headers();

  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        const cookieHeader = headerList.get("cookie") ?? "";
        return cookieHeader
          .split("; ")
          .map((cookie) => cookie.split("="))
          .filter((parts) => parts.length === 2)
          .map(([name, value]) => ({ name, value }));
      },
      setAll(_cookiesToSet) {
        // Called from a Server Component. Middleware refreshes the session.
      },
    },
  });
}
