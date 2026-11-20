import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Database } from "@/domain/database.types";
import type { AuthUserContext } from "@/domain/types";
import {
  configurationError,
  demoModeError,
  unauthorizedError,
} from "@/lib/api/errors";
import { getAppMode, isLiveMode } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AuthedSupabase = {
  supabase: SupabaseClient<Database>;
  user: AuthUserContext;
};

export function toAuthUser(user: User): AuthUserContext {
  return {
    id: user.id,
    email: user.email ?? null,
  };
}

/**
 * Resolves the authenticated user session for API routes.
 * - unconfigured ⇒ 503 configuration_error (never sample data)
 * - explicit demo ⇒ 503 demo_mode
 * - live without session ⇒ 401
 */
export async function requireAuth(): Promise<AuthedSupabase> {
  const mode = getAppMode();
  if (mode === "unconfigured") {
    throw configurationError();
  }
  if (mode === "demo" || !isLiveMode()) {
    throw demoModeError();
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw configurationError();
  }

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    throw unauthorizedError();
  }

  return {
    supabase,
    user: toAuthUser(data.user),
  };
}
