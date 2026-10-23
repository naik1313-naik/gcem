import { getCurrentUser } from "@/lib/auth";
import { alarmTemplateCsv } from "@/lib/csv";
import { isDemoMode } from "@/lib/demo-mode";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isDemoMode() && !isSupabaseConfigured) {
    return new Response("Supabase is not configured.", { status: 503 });
  }

  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  return new Response(`\uFEFF${alarmTemplateCsv()}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="windsage-alarm-template.csv"',
      "Cache-Control": "no-store",
    },
  });
}
