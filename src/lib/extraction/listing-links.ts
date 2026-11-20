/**
 * Phase 1: extract listing / property URLs that already appear in source documents.
 * Never invents links. Ignores vendor chrome (Rentometer, HelloData, Google Maps, etc.).
 */

export type ListingLinkKind = "zillow" | "apartments" | "website" | "ignored";

const VENDOR_HOST_RE =
  /(rentometer\.com|hellodata\.ai|google\.com|googleapis\.com|gstatic\.com|wikipedia\.org|adobe\.com|w3\.org|fonts\.|facebook\.com|twitter\.com|linkedin\.com|apple\.com|microsoft\.com|cloudflare\.com)/i;

const BARE_DOMAIN_RE =
  /\b((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:com|net|org|ai|io|co|us))\b/gi;

const BARE_DOMAIN_ONE =
  /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:com|net|org|ai|io|co|us)$/i;

const FULL_URL_RE = /https?:\/\/[^\s\)\]\"\'<>]+/gi;

export function stripTrailingPunctuation(url: string): string {
  return url.replace(/[.,;:!?)]+$/g, "");
}

export function normalizeListingUrl(raw: string): string | null {
  const trimmed = stripTrailingPunctuation(raw.trim());
  if (!trimmed) return null;
  if (/^javascript:/i.test(trimmed) || /^mailto:/i.test(trimmed)) return null;
  let candidate = trimmed;
  if (!/^https?:\/\//i.test(candidate)) {
    if (/^www\./i.test(candidate) || BARE_DOMAIN_ONE.test(candidate)) {
      candidate = `https://${candidate.replace(/^\/\//, "")}`;
    } else {
      return null;
    }
  }
  try {
    const u = new URL(candidate);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function hostMatches(host: string, domain: string): boolean {
  const h = host.toLowerCase();
  const d = domain.toLowerCase();
  return h === d || h.endsWith(`.${d}`);
}

export function classifyListingUrl(url: string): ListingLinkKind {
  try {
    const host = new URL(url).hostname.replace(/^www\./i, "");
    if (VENDOR_HOST_RE.test(host)) return "ignored";
    if (hostMatches(host, "zillow.com")) return "zillow";
    if (hostMatches(host, "apartments.com")) return "apartments";
    if (
      hostMatches(host, "realtor.com") ||
      hostMatches(host, "trulia.com") ||
      hostMatches(host, "hotpads.com") ||
      hostMatches(host, "rent.com")
    ) {
      return "website";
    }
    return "website";
  } catch {
    return "ignored";
  }
}

export type ExtractedListingLinks = {
  all: string[];
  zillow: string | null;
  apartments: string | null;
  websites: string[];
};

export function extractListingUrlsFromText(text: string): ExtractedListingLinks {
  const found = new Set<string>();
  for (const match of text.match(FULL_URL_RE) ?? []) {
    const n = normalizeListingUrl(match);
    if (n && classifyListingUrl(n) !== "ignored") found.add(n);
  }
  BARE_DOMAIN_RE.lastIndex = 0;
  for (const match of text.match(BARE_DOMAIN_RE) ?? []) {
    const n = normalizeListingUrl(match);
    if (n && classifyListingUrl(n) !== "ignored") found.add(n);
  }
  const all = [...found];
  let zillow: string | null = null;
  let apartments: string | null = null;
  const websites: string[] = [];
  for (const url of all) {
    const kind = classifyListingUrl(url);
    if (kind === "zillow" && !zillow) zillow = url;
    else if (kind === "apartments" && !apartments) apartments = url;
    else if (kind === "website") websites.push(url);
  }
  return { all, zillow, apartments, websites };
}

/** Prefer a single website domain line inside a HelloData / MLS card block. */
export function extractWebsiteFromBlock(block: string): string | null {
  const lines = block.split(/\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (/\s/.test(line) && !/^https?:\/\//i.test(line)) continue;
    const urls = extractListingUrlsFromText(line);
    if (urls.websites[0]) return urls.websites[0]!;
    if (urls.zillow) return urls.zillow;
    if (urls.apartments) return urls.apartments;
  }
  // Fallback: first non-vendor URL anywhere in the block
  const all = extractListingUrlsFromText(block);
  return all.websites[0] ?? all.zillow ?? all.apartments ?? null;
}

export async function extractPdfAnnotationUrls(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pdf: { numPages: number; getPage: (n: number) => Promise<any> },
  maxPages = 12,
): Promise<ExtractedListingLinks> {
  const raw: string[] = [];
  const limit = Math.min(pdf.numPages, maxPages);
  for (let p = 1; p <= limit; p++) {
    try {
      const page = await pdf.getPage(p);
      const annots = (await page.getAnnotations?.()) ?? [];
      for (const a of annots) {
        const u = a?.url ?? a?.unsafeUrl;
        if (typeof u === "string") raw.push(u);
      }
    } catch {
      /* page-level annotation failures are non-fatal */
    }
  }
  return extractListingUrlsFromText(raw.join("\n"));
}

export function extractExcelHyperlinks(
  // sheetjs workbook shape
  workbook: {
    SheetNames: string[];
    Sheets: Record<string, Record<string, { l?: { Target?: string }; v?: unknown; w?: string }>>;
  },
): ExtractedListingLinks {
  const raw: string[] = [];
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    if (!sheet) continue;
    for (const addr of Object.keys(sheet)) {
      if (addr.startsWith("!")) continue;
      const cell = sheet[addr];
      if (cell?.l?.Target) raw.push(String(cell.l.Target));
      const display = String(cell?.w ?? cell?.v ?? "");
      if (/https?:\/\//i.test(display) || /^www\./i.test(display)) raw.push(display);
    }
  }
  return extractListingUrlsFromText(raw.join("\n"));
}

/** Merge extracted links into property.external_links without overwriting staff values. */
export function mergeExternalLinksPreserveStaff(
  existing: Record<string, unknown> | null | undefined,
  extracted: ExtractedListingLinks,
): { next: Record<string, unknown>; changed: boolean } {
  const next: Record<string, unknown> = { ...(existing ?? {}) };
  let changed = false;
  const existingZillow =
    typeof next.zillow === "string" && next.zillow.startsWith("http") ? next.zillow : null;
  const existingApts =
    typeof next.apartments === "string" && next.apartments.startsWith("http")
      ? next.apartments
      : typeof next.apartments_com === "string" &&
          String(next.apartments_com).startsWith("http")
        ? String(next.apartments_com)
        : null;
  if (!existingZillow && extracted.zillow) {
    next.zillow = extracted.zillow;
    changed = true;
  }
  if (!existingApts && extracted.apartments) {
    next.apartments = extracted.apartments;
    changed = true;
  }
  if (
    extracted.websites[0] &&
    !(typeof next.website === "string" && next.website.startsWith("http"))
  ) {
    next.website = extracted.websites[0];
    changed = true;
  }
  return { next, changed };
}
