import { jsonOk } from "@/lib/api/response";
import { getAppMode, getSupabasePublicEnv } from "@/lib/supabase/env";

export async function GET() {
  const mode = getAppMode();
  const configured = Boolean(getSupabasePublicEnv());

  return jsonOk({
    service: "pkl-rent-intelligence",
    mode,
    supabaseConfigured: configured,
    liveApiEnabled: mode === "live",
    timestamp: new Date().toISOString(),
  });
}
