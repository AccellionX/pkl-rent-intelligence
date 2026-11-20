/**
 * Tenant-scoped idempotency for consequential POST/create/finalize routes.
 *
 * - Process-local memory + in-flight coalescing (same Node process)
 * - Durable `api_idempotency_keys` claims for cross-instance safety
 * - Same key + different request fingerprint → 409 conflict
 * - Failed claims can be retried with the same key+fingerprint
 */

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { conflictError } from "@/lib/api/errors";

export type IdempotentResult<T> = {
  data: T;
  status: number;
  replayed: boolean;
};

type StoredEnvelope = {
  status: number;
  body: unknown;
  createdAt: number;
  fingerprint: string;
};

type DurableRow = {
  id?: string;
  request_fingerprint?: string;
  state?: string;
  status_code?: number | null;
  response_body?: unknown;
  error_message?: string | null;
  created_at?: string;
  expires_at?: string;
};

const MEMORY_TTL_MS = 24 * 60 * 60 * 1000;
const memory = new Map<string, StoredEnvelope>();
const inflight = new Map<string, Promise<StoredEnvelope>>();

export function readIdempotencyKey(request: Request): string | null {
  const raw = request.headers.get("Idempotency-Key")?.trim() ?? "";
  if (raw.length < 8 || raw.length > 128) return null;
  if (!/^[A-Za-z0-9._~-]+$/.test(raw)) return null;
  return raw;
}

export function fingerprintPayload(parts: unknown[]): string {
  const h = createHash("sha256");
  for (const part of parts) {
    h.update(typeof part === "string" ? part : JSON.stringify(part ?? null));
    h.update("\n");
  }
  return h.digest("hex").slice(0, 64);
}

export async function fingerprintRequest(
  request: Request,
  extra: unknown[] = [],
): Promise<string> {
  const method = request.method.toUpperCase();
  const url = new URL(request.url);
  const path = `${url.pathname}${url.search}`;
  let bodyPart = "";
  try {
    if (method !== "GET" && method !== "HEAD") {
      const ct = request.headers.get("content-type") ?? "";
      if (ct.includes("multipart/form-data")) {
        // Body already consumed by callers for FormData — fingerprint via extras only.
        bodyPart = "multipart";
      } else {
        bodyPart = await request.clone().text();
      }
    }
  } catch {
    bodyPart = "";
  }
  return fingerprintPayload([method, path, bodyPart, ...extra]);
}

export function idempotencyScope(
  organizationId: string,
  userId: string,
  route: string,
  key: string,
): string {
  return `${organizationId}::${userId}::${route}::${key}`;
}

function pruneExpired() {
  const now = Date.now();
  for (const [k, v] of memory) {
    if (now - v.createdAt > MEMORY_TTL_MS) memory.delete(k);
  }
}

function assertFingerprintMatch(stored: string, incoming: string) {
  if (stored && incoming && stored !== incoming) {
    throw conflictError(
      "This Idempotency-Key was already used with a different request. Use a new key or retry the original request unchanged.",
      { code: "idempotency_fingerprint_mismatch" },
    );
  }
}

async function readDurable(
  supabase: SupabaseClient | null | undefined,
  organizationId: string,
  userId: string,
  route: string,
  key: string,
): Promise<DurableRow | null> {
  if (!supabase) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("api_idempotency_keys")
      .select(
        "id, request_fingerprint, state, status_code, response_body, error_message, created_at, expires_at",
      )
      .eq("organization_id", organizationId)
      .eq("user_id", userId)
      .eq("route", route)
      .eq("idempotency_key", key)
      .maybeSingle();
    if (error || !data) return null;
    return data as DurableRow;
  } catch {
    return null;
  }
}

async function claimDurable(opts: {
  supabase: SupabaseClient;
  organizationId: string;
  userId: string;
  route: string;
  key: string;
  fingerprint: string;
}): Promise<"claimed" | "exists"> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (opts.supabase as any).from("api_idempotency_keys").insert({
      organization_id: opts.organizationId,
      user_id: opts.userId,
      route: opts.route,
      idempotency_key: opts.key,
      request_fingerprint: opts.fingerprint,
      state: "pending",
      expires_at: new Date(Date.now() + MEMORY_TTL_MS).toISOString(),
    });
    if (!error) return "claimed";
    const code = String((error as { code?: string }).code ?? "");
    if (code === "23505") return "exists";
    // Table missing / RLS — treat as no durable claim.
    return "claimed";
  } catch {
    return "claimed";
  }
}

async function completeDurable(opts: {
  supabase: SupabaseClient | null | undefined;
  organizationId: string;
  userId: string;
  route: string;
  key: string;
  fingerprint: string;
  envelope: StoredEnvelope | null;
  failedMessage?: string;
}): Promise<void> {
  if (!opts.supabase) return;
  try {
    const patch =
      opts.envelope != null
        ? {
            state: "completed",
            status_code: opts.envelope.status,
            response_body: opts.envelope.body,
            error_message: null,
            request_fingerprint: opts.fingerprint,
            updated_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + MEMORY_TTL_MS).toISOString(),
          }
        : {
            state: "failed",
            status_code: null,
            response_body: null,
            error_message: (opts.failedMessage ?? "Operation failed").slice(0, 2000),
            request_fingerprint: opts.fingerprint,
            updated_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + MEMORY_TTL_MS).toISOString(),
          };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (opts.supabase as any)
      .from("api_idempotency_keys")
      .update(patch)
      .eq("organization_id", opts.organizationId)
      .eq("user_id", opts.userId)
      .eq("route", opts.route)
      .eq("idempotency_key", opts.key);
  } catch {
    // Best-effort durable complete.
  }
}

async function waitForDurableCompletion(
  supabase: SupabaseClient,
  organizationId: string,
  userId: string,
  route: string,
  key: string,
  fingerprint: string,
): Promise<StoredEnvelope | null> {
  for (let i = 0; i < 40; i++) {
    const row = await readDurable(supabase, organizationId, userId, route, key);
    if (!row) return null;
    assertFingerprintMatch(row.request_fingerprint ?? "", fingerprint);
    if (row.state === "completed" && typeof row.status_code === "number") {
      return {
        status: row.status_code,
        body: row.response_body,
        createdAt: row.created_at ? Date.parse(row.created_at) : Date.now(),
        fingerprint: row.request_fingerprint ?? fingerprint,
      };
    }
    if (row.state === "failed") {
      // Allow same-key retry after failure — reset claim to pending.
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
          .from("api_idempotency_keys")
          .update({
            state: "pending",
            status_code: null,
            response_body: null,
            error_message: null,
            updated_at: new Date().toISOString(),
          })
          .eq("organization_id", organizationId)
          .eq("user_id", userId)
          .eq("route", route)
          .eq("idempotency_key", key)
          .eq("state", "failed");
      } catch {
        /* ignore */
      }
      return null;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw conflictError(
    "A previous request with this Idempotency-Key is still processing. Wait a moment and retry with the same key.",
    { code: "idempotency_in_progress" },
  );
}

/**
 * Run a create/finalize once per Idempotency-Key within org+user+route scope.
 * Prefer passing `fingerprint` when the request body was already consumed (FormData).
 */
export async function runIdempotent<T>(opts: {
  request: Request;
  organizationId: string;
  userId: string;
  route: string;
  supabase?: SupabaseClient | null;
  defaultStatus?: number;
  /** Precomputed fingerprint when body was already read (uploads). */
  fingerprint?: string;
  fingerprintExtra?: unknown[];
  execute: () => Promise<{ data: T; status?: number }>;
}): Promise<IdempotentResult<T>> {
  const key = readIdempotencyKey(opts.request);
  if (!key) {
    const result = await opts.execute();
    return {
      data: result.data,
      status: result.status ?? opts.defaultStatus ?? 201,
      replayed: false,
    };
  }

  const fingerprint =
    opts.fingerprint ??
    (await fingerprintRequest(opts.request, opts.fingerprintExtra ?? []));

  pruneExpired();
  const scope = idempotencyScope(opts.organizationId, opts.userId, opts.route, key);

  const memHit = memory.get(scope);
  if (memHit) {
    assertFingerprintMatch(memHit.fingerprint, fingerprint);
    return {
      data: memHit.body as T,
      status: memHit.status,
      replayed: true,
    };
  }

  if (opts.supabase) {
    const durable = await readDurable(
      opts.supabase,
      opts.organizationId,
      opts.userId,
      opts.route,
      key,
    );
    if (durable) {
      assertFingerprintMatch(durable.request_fingerprint ?? "", fingerprint);
      if (durable.state === "completed" && typeof durable.status_code === "number") {
        const envelope: StoredEnvelope = {
          status: durable.status_code,
          body: durable.response_body,
          createdAt: durable.created_at ? Date.parse(durable.created_at) : Date.now(),
          fingerprint,
        };
        memory.set(scope, envelope);
        return {
          data: envelope.body as T,
          status: envelope.status,
          replayed: true,
        };
      }
      if (durable.state === "pending") {
        const waited = await waitForDurableCompletion(
          opts.supabase,
          opts.organizationId,
          opts.userId,
          opts.route,
          key,
          fingerprint,
        );
        if (waited) {
          memory.set(scope, waited);
          return {
            data: waited.body as T,
            status: waited.status,
            replayed: true,
          };
        }
      }
      if (durable.state === "failed") {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (opts.supabase as any)
            .from("api_idempotency_keys")
            .update({
              state: "pending",
              status_code: null,
              response_body: null,
              error_message: null,
              request_fingerprint: fingerprint,
              updated_at: new Date().toISOString(),
            })
            .eq("organization_id", opts.organizationId)
            .eq("user_id", opts.userId)
            .eq("route", opts.route)
            .eq("idempotency_key", key)
            .eq("state", "failed");
        } catch {
          /* ignore */
        }
      }
    }
  }

  const existingInflight = inflight.get(scope);
  if (existingInflight) {
    const stored = await existingInflight;
    assertFingerprintMatch(stored.fingerprint, fingerprint);
    return {
      data: stored.body as T,
      status: stored.status,
      replayed: true,
    };
  }

  let resolveInflight!: (value: StoredEnvelope) => void;
  let rejectInflight!: (reason: unknown) => void;
  const promise = new Promise<StoredEnvelope>((resolve, reject) => {
    resolveInflight = resolve;
    rejectInflight = reject;
  });
  inflight.set(scope, promise);

  void (async () => {
    try {
      if (opts.supabase) {
        const claim = await claimDurable({
          supabase: opts.supabase,
          organizationId: opts.organizationId,
          userId: opts.userId,
          route: opts.route,
          key,
          fingerprint,
        });
        if (claim === "exists") {
          const waited = await waitForDurableCompletion(
            opts.supabase,
            opts.organizationId,
            opts.userId,
            opts.route,
            key,
            fingerprint,
          );
          if (waited) {
            memory.set(scope, waited);
            resolveInflight(waited);
            return;
          }
          // Re-claim after failed cleanup.
          await claimDurable({
            supabase: opts.supabase,
            organizationId: opts.organizationId,
            userId: opts.userId,
            route: opts.route,
            key,
            fingerprint,
          });
        }
      }

      const result = await opts.execute();
      const envelope: StoredEnvelope = {
        status: result.status ?? opts.defaultStatus ?? 201,
        body: result.data,
        createdAt: Date.now(),
        fingerprint,
      };
      memory.set(scope, envelope);
      await completeDurable({
        supabase: opts.supabase,
        organizationId: opts.organizationId,
        userId: opts.userId,
        route: opts.route,
        key,
        fingerprint,
        envelope,
      });
      resolveInflight(envelope);
    } catch (err) {
      await completeDurable({
        supabase: opts.supabase,
        organizationId: opts.organizationId,
        userId: opts.userId,
        route: opts.route,
        key,
        fingerprint,
        envelope: null,
        failedMessage: err instanceof Error ? err.message : "Operation failed",
      });
      rejectInflight(err);
    } finally {
      inflight.delete(scope);
    }
  })();

  const stored = await promise;
  return {
    data: stored.body as T,
    status: stored.status,
    replayed: false,
  };
}

/** Test-only: clear process memory (does not touch DB). */
export function __resetIdempotencyMemoryForTests() {
  memory.clear();
  inflight.clear();
}
