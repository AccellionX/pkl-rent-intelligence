import { jsonOk } from "@/lib/api/response";
import {
  configurationHelpMessage,
  getAppMode,
  getSupabasePublicEnv,
  isDemoModeExplicitlyAllowed,
  missingPublicEnvNames,
} from "@/lib/supabase/env";

export async function GET() {
  const mode = getAppMode();
  const configured = Boolean(getSupabasePublicEnv());
  const missing = missingPublicEnvNames();

  return jsonOk({
    service: "pkl-rent-intelligence",
    mode,
    supabaseConfigured: configured,
    liveApiEnabled: mode === "live",
    demoExplicitlyAllowed: isDemoModeExplicitlyAllowed(),
    missingEnvVarNames: missing,
    configurationMessage:
      mode === "unconfigured" ? configurationHelpMessage() : null,
    timestamp: new Date().toISOString(),
  });
}
