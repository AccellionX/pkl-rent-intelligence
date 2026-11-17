"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/domain/database.types";
import { getSupabasePublicEnv } from "./env";

/**
 * Browser Supabase client (anon key only).
 * Returns null when the app is in demo mode (no Supabase env).
 */
export function createSupabaseBrowserClient() {
  const env = getSupabasePublicEnv();
  if (!env) return null;
  return createBrowserClient<Database>(env.url, env.anonKey);
}
