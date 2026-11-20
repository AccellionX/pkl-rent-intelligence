import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(process.cwd(), "src");

/** Customer-facing live screens that must not show raw IDs or infrastructure jargon. */
const SURFACES = [
  "components/live/live-buildings.tsx",
  "components/live/live-dashboard.tsx",
  "components/live/live-building-detail.tsx",
  "components/live/live-reports-history.tsx",
  "components/live/live-photo-manager.tsx",
  "components/live/live-subject-units.tsx",
  "components/live/live-auth-gate.tsx",
  "components/live/live-drive-settings.tsx",
  "components/live/live-property-drive.tsx",
  "components/live/configuration-required.tsx",
  "components/live/mode-gate.tsx",
  "components/buildings/live-comparables-review.tsx",
  "components/buildings/live-report-narrative.tsx",
  "components/buildings/live-pdf-reports.tsx",
  "components/buildings/live-weekly-leads.tsx",
  "app/login/page.tsx",
  "app/settings/page.tsx",
  "app/upload/page.tsx",
  "app/units/page.tsx",
  "app/reports/schedule/page.tsx",
];

const FORBIDDEN_LABEL_PATTERNS = [
  /Organization ID/i,
  /Org ID/i,
  /Report UUID/i,
  /Property UUID/i,
  /Database ID/i,
  /source.document.?id/i,
  /PGRST\d+/i,
  /label=["']organizationId["']/i,
  />\s*organizationId\s*</,
  /\bSupabase\b/,
  /\bPostgreSQL\b/,
  /\bVercel\b/,
  /\bJWT\b/,
  /\bRLS\b/,
  /demo mode/i,
  /live mode/i,
  /sample data/i,
  /mock data/i,
  /NEXT_PUBLIC_/,
  /SUPABASE_SERVICE_ROLE/,
  /ANTHROPIC_API_KEY/,
  /storage bucket/i,
  /schema cache/i,
  /Phase 1\b/,
];

describe("customer UI — no internal ID labels or infrastructure jargon", () => {
  for (const rel of SURFACES) {
    it(`${rel} stays free of developer-facing terminology`, () => {
      const src = readFileSync(join(root, rel), "utf8");
      for (const re of FORBIDDEN_LABEL_PATTERNS) {
        expect(src, `${rel} matched ${re}`).not.toMatch(re);
      }
    });
  }

  it("login page uses professional sign-in copy", () => {
    const src = readFileSync(join(root, "app/login/page.tsx"), "utf8");
    expect(src).toMatch(/Sign in to your account/);
    expect(src).toMatch(/Enter your email and password to continue/);
    expect(src).not.toMatch(/Supabase Auth/i);
    expect(src).not.toMatch(/sample portfolio/i);
  });

  it("comparables document list prefers filename over raw document id fallback text", () => {
    const src = readFileSync(
      join(root, "components/buildings/live-comparables-review.tsx"),
      "utf8",
    );
    expect(src).toMatch(/original_filename \?\? "Untitled document"/);
    expect(src).not.toMatch(/original_filename \?\? d\.id/);
  });

  it("PDF / narrative status lines use human label helpers", () => {
    const narrative = readFileSync(
      join(root, "components/buildings/live-report-narrative.tsx"),
      "utf8",
    );
    const pdf = readFileSync(
      join(root, "components/buildings/live-pdf-reports.tsx"),
      "utf8",
    );
    expect(narrative).toMatch(/labelNarrativeStatus|labelAssemblyStatus/);
    expect(pdf).toMatch(/labelNarrativeStatus|labelAssemblyStatus/);
    expect(narrative).not.toMatch(/· assembly \{payload\.status\}/);
    expect(pdf).not.toMatch(/Narrative: \{status\.narrativeStatus \?\? "none"\}/);
  });

  it("does not render raw document UUIDs in upload history surface", () => {
    const src = readFileSync(join(root, "app/upload/page.tsx"), "utf8");
    expect(src).not.toMatch(/Document \{liveDocumentId\}/);
    expect(src).not.toMatch(/\{liveDocumentId\} ·/);
  });
});

describe("customer UI — scan live TSX for infrastructure provider names in string literals", () => {
  it("flags unexpected Supabase/Vercel/JWT string literals in components and app pages", () => {
    const dirs = [
      join(root, "components/live"),
      join(root, "components/buildings"),
      join(root, "app"),
    ];
    const hits: string[] = [];
    // User-facing string literals only — ignore import paths / identifiers.
    const forbidden =
      /["'`][^"'`\n]*(?:\bSupabase\b|\bPostgreSQL\b|\bVercel\b|\bJWT\b|RLS policy|demo mode|live mode|sample data|NEXT_PUBLIC_SUPABASE)[^"'`\n]*["'`]/;

    function walk(dir: string) {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === "ui" || entry.name === "charts") continue;
          walk(path);
          continue;
        }
        if (!/\.tsx$/.test(entry.name)) continue;
        // Demo-only portfolio fixtures are not mounted by ModeGate in customer builds.
        if (/demo-/.test(entry.name)) continue;
        const src = readFileSync(path, "utf8")
          // Drop import lines so "@/lib/supabase/..." does not false-positive.
          .split("\n")
          .filter((line) => !/^\s*import\b/.test(line))
          .join("\n");
        if (forbidden.test(src)) hits.push(path.replace(root + "/", ""));
      }
    }

    for (const dir of dirs) walk(dir);
    expect(hits, hits.join("\n")).toEqual([]);
  });
});
