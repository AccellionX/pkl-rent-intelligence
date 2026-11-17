import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/domain/database.types";
import { getSupabasePublicEnv } from "./env";

/**
 * Request-scoped Supabase client using the user session (RLS enforced).
 * Returns null in demo mode.
 */
export async function createSupabaseServerClient() {
  const env = getSupabasePublicEnv();
  if (!env) return null;

  const cookieStore = await cookies();

  return createServerClient<Database>(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Called from a Server Component without mutable cookies — proxy refreshes sessions.
        }
      },
    },
  });
}
