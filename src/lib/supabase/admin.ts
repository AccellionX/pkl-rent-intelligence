import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/domain/database.types";
import { getSupabaseServerEnv } from "./env";

/**
 * Privileged server-only client. Prefer the user-scoped server client + RLS.
 * Use this only for trusted administrative paths that cannot run as the user.
 */
export function createSupabaseAdminClient() {
  const env = getSupabaseServerEnv();
  if (!env?.serviceRoleKey) {
    throw new Error(
      "Supabase admin client requires NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY",
    );
  }

  return createClient<Database>(env.url, env.serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
