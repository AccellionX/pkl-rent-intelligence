import type { AppMode } from "@/domain/types";

export interface SupabasePublicEnv {
  url: string;
  anonKey: string;
}

export interface SupabaseServerEnv extends SupabasePublicEnv {
  serviceRoleKey?: string;
}

export const REQUIRED_PUBLIC_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const;

export const REQUIRED_SERVER_ENV = ["SUPABASE_SERVICE_ROLE_KEY"] as const;

function trimEnv(value: string | undefined): string | undefined {
  if (!value || !value.trim()) return undefined;
  return value.trim();
}

/**
 * Next.js only inlines NEXT_PUBLIC_* when accessed as static property reads
 * (process.env.NEXT_PUBLIC_FOO). Dynamic process.env[name] is undefined in the
 * browser bundle and was a root cause of “demo mode has no server login”.
 */
function readPublicUrl(): string | undefined {
  return trimEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
}

function readPublicAnonKey(): string | undefined {
  return trimEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

function readServiceRoleKey(): string | undefined {
  return trimEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function readAllowDemo(): string | undefined {
  return trimEnv(process.env.PKL_ALLOW_DEMO_MODE);
}

/**
 * Explicit opt-in for isolated developer/demo fixtures.
 * Customer-facing / production builds must NOT set this.
 * Missing Supabase public config never silently activates demo.
 */
export function isDemoModeExplicitlyAllowed(): boolean {
  return readAllowDemo() === "true";
}

/**
 * Application mode:
 * - live: public Supabase URL + anon/publishable key present
 * - demo: only when PKL_ALLOW_DEMO_MODE=true (dev/test tooling)
 * - unconfigured: missing required public env (fail clearly — no sample portfolio)
 */
export function getAppMode(): AppMode {
  const url = readPublicUrl();
  const anonKey = readPublicAnonKey();
  if (url && anonKey) return "live";
  if (isDemoModeExplicitlyAllowed()) return "demo";
  return "unconfigured";
}

export function isLiveMode(): boolean {
  return getAppMode() === "live";
}

export function isCustomerFacingLiveRequired(): boolean {
  return !isDemoModeExplicitlyAllowed();
}

export function missingPublicEnvNames(): string[] {
  const missing: string[] = [];
  if (!readPublicUrl()) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!readPublicAnonKey()) missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return missing;
}

export function getSupabasePublicEnv(): SupabasePublicEnv | null {
  const url = readPublicUrl();
  const anonKey = readPublicAnonKey();
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

export function getSupabaseServerEnv(): SupabaseServerEnv | null {
  const publicEnv = getSupabasePublicEnv();
  if (!publicEnv) return null;
  return {
    ...publicEnv,
    serviceRoleKey: readServiceRoleKey(),
  };
}

/** Service role must never be imported by client components. */
export function getServiceRoleKeyOrThrow(): string {
  const key = readServiceRoleKey();
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

export function configurationHelpMessage(): string {
  const missing = missingPublicEnvNames();
  if (missing.length === 0) {
    return "Application configuration is present.";
  }
  // Customer-facing copy only — never list env var names or hosting providers.
  void missing;
  return "The application isn’t fully set up. Please contact your administrator.";
}
