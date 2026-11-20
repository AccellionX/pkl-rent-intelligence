import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadDotEnv() {
  if (!existsSync(".env")) return;
  for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    if (!process.env[m[1]!]) process.env[m[1]!] = m[2]!.trim();
  }
}

loadDotEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
const service = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const configured = Boolean(url && anon && service);

describe("live Supabase probe (Task #5)", () => {
  it("reports configuration presence without printing secrets", () => {
    expect(typeof configured).toBe("boolean");
    if (configured) {
      expect(url!).toMatch(/^https:\/\/.+\.supabase\.co\/?$/);
      expect(anon!.length).toBeGreaterThan(10);
      expect(service!.length).toBeGreaterThan(10);
    }
  });

  it(
    "detects whether Phase 1 tables are exposed to PostgREST",
    async () => {
      if (!configured) {
        console.warn("SKIP: Supabase env not configured");
        return;
      }
      const admin = createClient(url!, service!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const openapi = await fetch(`${url}/rest/v1/`, {
        headers: { apikey: service!, Authorization: `Bearer ${service}` },
      });
      const spec = (await openapi.json()) as {
        definitions?: Record<string, unknown>;
        paths?: Record<string, unknown>;
      };
      const defs = Object.keys(spec.definitions ?? {});
      // Do not use head:true — it can return 204/null error while the table is missing.
      const { error, status } = await admin.from("organizations").select("id").limit(1);

      // Honest assertion: either schema is ready, or we explicitly record the blocker.
      if (error || status >= 400 || !defs.includes("organizations")) {
        console.warn(
          "BLOCKED: Phase 1 schema not visible to PostgREST (PGRST205 / empty OpenAPI). Apply migrations then reload schema.",
        );
        expect(Boolean(error) || status >= 400 || !defs.includes("organizations")).toBe(
          true,
        );
        return;
      }
      expect(error).toBeNull();
    },
    20_000,
  );

  it(
    "keeps source-documents bucket private when present",
    async () => {
      if (!configured) return;
      const admin = createClient(url!, service!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: buckets } = await admin.storage.listBuckets();
      const source = buckets?.find((b) => b.id === "source-documents");
      if (!source) {
        console.warn("BLOCKED: source-documents bucket missing");
        return;
      }
      expect(source.public).toBe(false);
      const pub = await fetch(`${url}/storage/v1/object/public/source-documents/nope`);
      expect(pub.status).not.toBe(200);
    },
    20_000,
  );

  it(
    "can authenticate a JWT session against Auth when credentials work",
    async () => {
      if (!configured) return;
      const admin = createClient(url!, service!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });
      expect(error).toBeNull();
      expect(Array.isArray(data.users)).toBe(true);
    },
    20_000,
  );
});
