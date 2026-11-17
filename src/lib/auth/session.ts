import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Database } from "@/domain/database.types";
import type { AuthUserContext } from "@/domain/types";
import { demoModeError, unauthorizedError } from "@/lib/api/errors";
import { isLiveMode } from "@/lib/supabase/env";
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
 * Demo mode ⇒ 503 demo_mode (never silently serves seed data).
 * Live mode without session ⇒ 401.
 */
export async function requireAuth(): Promise<AuthedSupabase> {
  if (!isLiveMode()) {
    throw demoModeError();
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw demoModeError();
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
