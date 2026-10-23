"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";

import { findDemoAccount } from "@/lib/demo-accounts";
import { isDemoMode } from "@/lib/demo-mode";
import { DEMO_COOKIE } from "@/lib/demo-session";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { ActionState } from "@/lib/types";

export async function loginAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) {
    return { ok: false, message: "Email and password are required." };
  }

  if (isDemoMode()) {
    const account = findDemoAccount(email, password);
    if (!account) return { ok: false, message: "Invalid demo email or password." };
    // Use the demo-login route to set the session cookie, since cookies()
    // from next/headers hangs in this environment.
    redirect(`/demo-login?email=${encodeURIComponent(account.email)}`);
  }

  if (!isSupabaseConfigured) {
    return {
      ok: false,
      message: "Supabase is not configured. Add the environment variables from .env.example.",
    };
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { ok: false, message: "Invalid email or password." };
  } catch {
    return { ok: false, message: "Could not reach Supabase. Check the project URL and anon key." };
  }

  revalidatePath("/", "layout");
  redirect("/");
}

export async function logoutAction(): Promise<ActionState | Response> {
  if (isDemoMode()) {
    // Clear the demo session cookie and redirect to login.
    const baseUrl =
      process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://localhost:3000";
    const response = NextResponse.redirect(new URL("/login", baseUrl));
    response.cookies.set(DEMO_COOKIE, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
    });
    return response;
  }

  if (isSupabaseConfigured) {
    try {
      const supabase = await createClient();
      await supabase.auth.signOut();
    } catch {
      // Redirect to login even if the session is already invalid.
    }
  }
  redirect("/login");
}
