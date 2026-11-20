import type { NormalizedAddressParts } from "./types";

export function normalizeHeader(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/[$/]/g, " ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function parseCurrency(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const text = String(raw).trim();
  if (!text || text === "-" || text.toLowerCase() === "n/a") return null;
  const cleaned = text.replace(/[^0-9.-]/g, "");
  if (!cleaned || cleaned === "-" || cleaned === ".") return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

export function parseNumber(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const text = String(raw).trim();
  if (!text) return null;
  const cleaned = text.replace(/,/g, "").replace(/[^0-9.-]/g, "");
  if (!cleaned) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

/** Handles `1ba`, `1`, `1.5`, `1 bath`. */
export function parseBaths(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const text = String(raw).trim().toLowerCase();
  if (!text) return null;
  const match = text.match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

export function parseBooleanFlag(raw: string | null | undefined): boolean | null {
  if (raw == null || String(raw).trim() === "") return null;
  const text = String(raw).trim().toLowerCase();
  if (["true", "yes", "y", "1"].includes(text)) return true;
  if (["false", "no", "n", "0"].includes(text)) return false;
  return null;
}

export function normalizeAddress(raw: string | null | undefined): NormalizedAddressParts | null {
  if (raw == null) return null;
  const trimmed = String(raw).replace(/\s+/g, " ").trim();
  if (!trimmed) return null;

  const normalized = trimmed
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/,/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // HelloData map cards often emit "City, ST, 02920" (comma between state and ZIP).
  const canonical = trimmed.replace(
    /,\s*([A-Za-z]{2})\s*,\s*(\d{5}(?:-\d{4})?)\b/,
    ", $1 $2",
  );
  const parts = canonical.split(",").map((p) => p.trim()).filter(Boolean);
  let city: string | null = null;
  let state: string | null = null;
  let postalCode: string | null = null;
  const line1: string | null = parts[0] ?? canonical;

  if (parts.length >= 3) {
    city = parts[parts.length - 2] ?? null;
    const stateZip = parts[parts.length - 1] ?? "";
    const stateZipMatch = stateZip.match(/^([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)(?:\s+USA)?$/i)
      ?? stateZip.match(/^([A-Za-z]{2})$/);
    if (stateZipMatch) {
      state = stateZipMatch[1]!.toUpperCase();
      postalCode = stateZipMatch[2] ?? null;
    } else if (/^[A-Za-z]{2}$/.test(stateZip)) {
      state = stateZip.toUpperCase();
    }
  } else {
    const inline = canonical.match(/,\s*([^,]+),\s*([A-Za-z]{2})\s+(\d{5})/i);
    if (inline) {
      city = inline[1]!;
      state = inline[2]!.toUpperCase();
      postalCode = inline[3]!;
    }
  }

  return {
    raw: canonical,
    normalized,
    line1,
    city,
    state,
    postalCode,
  };
}

export function addressesLikelyMatch(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  if (!left || !right) return false;
  const a = normalizeAddress(left)?.normalized;
  const b = normalizeAddress(right)?.normalized;
  if (!a || !b) return false;
  if (a === b) return true;
  // Loose prefix match on street line for subject detection.
  const aLine = a.split(" ").slice(0, 4).join(" ");
  const bLine = b.split(" ").slice(0, 4).join(" ");
  return Boolean(aLine && bLine && (a.startsWith(bLine) || b.startsWith(aLine)));
}

export function extractRentometerReportIdFromFilename(filename: string): string | null {
  const base = filename.split(/[/\\]/).pop() ?? filename;
  // e.g. ...-2-bed-qPiKWT24DL0.csv
  const match = base.match(/-([A-Za-z0-9]{8,14})(?:\.[^.]+)?$/);
  return match?.[1] ?? null;
}

export function isSuspiciousSqft(sqft: number | null): boolean {
  if (sqft == null) return false;
  return sqft < 200 || sqft > 5000;
}

export function sanitizeStorageFilename(filename: string): string {
  const base = filename.split(/[/\\]/).pop() ?? "upload.bin";
  return base.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 180) || "upload.bin";
}
