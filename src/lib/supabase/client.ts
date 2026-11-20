"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/domain/database.types";
import { getSupabasePublicEnv } from "./env";

/**
 * Browser Supabase client (anon/publishable key only).
 * Returns null when public Supabase env is missing (unconfigured — not a demo fallback).
 */
export function createSupabaseBrowserClient() {
  const env = getSupabasePublicEnv();
  if (!env) return null;
  return createBrowserClient<Database>(env.url, env.anonKey);
}
