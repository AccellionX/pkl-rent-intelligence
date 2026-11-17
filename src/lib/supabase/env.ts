import type { AppMode } from "@/domain/types";

export interface SupabasePublicEnv {
  url: string;
  anonKey: string;
}

export interface SupabaseServerEnv extends SupabasePublicEnv {
  serviceRoleKey?: string;
}

function readEnv(name: string): string | undefined {
  const value = process.env[name];
  if (!value || !value.trim()) return undefined;
  return value.trim();
}

/** Explicit demo vs live mode. Missing public Supabase config ⇒ demo. */
export function getAppMode(): AppMode {
  const url = readEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = readEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!url || !anonKey) return "demo";
  return "live";
}

export function isLiveMode(): boolean {
  return getAppMode() === "live";
}

export function getSupabasePublicEnv(): SupabasePublicEnv | null {
  const url = readEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = readEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

export function getSupabaseServerEnv(): SupabaseServerEnv | null {
  const publicEnv = getSupabasePublicEnv();
  if (!publicEnv) return null;
  return {
    ...publicEnv,
    serviceRoleKey: readEnv("SUPABASE_SERVICE_ROLE_KEY"),
  };
}

/** Service role must never be imported by client components. */
export function getServiceRoleKeyOrThrow(): string {
  const key = readEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  }
  if (
    typeof window !== "undefined" ||
    process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY
  ) {
    throw new Error("Service role key must not be exposed to the browser");
  }
  return key;
}
