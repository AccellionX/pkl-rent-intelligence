import type { MlsDialect } from "./mls-types";
import { parseCtMlsPdfBuffer } from "./mls-ct-pdf";
import { parseRiMlsPdfBuffer } from "./mls-ri-pdf";
import type { MlsParseResult } from "./mls-types";
import { extractText, getDocumentProxy } from "unpdf";

export function detectMlsDialectFromText(text: string): MlsDialect {
  if (/connectMLS/i.test(text) || /SmartMLS/i.test(text)) return "ct_connectmls";
  if (
    /NY State Alliance of MLS/i.test(text) ||
    /Brief Summary of Compared Listings/i.test(text) ||
    /State-Wide MLS|Rhode Island/i.test(text)
  ) {
    return "ri_statewide";
  }
  if (/Listing ID:\s*\d{8}/i.test(text) && /Norwich,\s*CT/i.test(text)) {
    return "ct_connectmls";
  }
  if (/MLS\s*#:\s*\d{7}/i.test(text) && /Photo Gallery/i.test(text)) {
    return "ri_statewide";
  }
  return "unknown";
}

export async function detectMlsDialectFromPdf(
  bytes: Uint8Array,
): Promise<MlsDialect> {
  const pdf = await getDocumentProxy(bytes.slice());
  const { text } = await extractText(pdf, { mergePages: true });
  const joined = Array.isArray(text) ? text.join("\n") : String(text);
  return detectMlsDialectFromText(joined);
}

export async function parseMlsPdfBuffer(opts: {
  filename: string;
  bytes: Uint8Array;
  dialectHint?: "mls_ri_pdf" | "mls_ct_pdf" | null;
}): Promise<MlsParseResult> {
  let dialect: MlsDialect = "unknown";
  if (opts.dialectHint === "mls_ri_pdf") dialect = "ri_statewide";
  else if (opts.dialectHint === "mls_ct_pdf") dialect = "ct_connectmls";
  else dialect = await detectMlsDialectFromPdf(opts.bytes);

  if (dialect === "ct_connectmls") {
    return parseCtMlsPdfBuffer(opts);
  }
  if (dialect === "ri_statewide") {
    return parseRiMlsPdfBuffer(opts);
  }

  // Fallback: try CT then RI and pick the richer parse
  const ct = await parseCtMlsPdfBuffer(opts);
  const ri = await parseRiMlsPdfBuffer(opts);
  if (ct.listings.length >= ri.listings.length && ct.listings.length > 0) {
    return {
      ...ct,
      warnings: [
        ...ct.warnings,
        {
          code: "dialect_uncertain",
          message: "MLS dialect was uncertain; used CT connectMLS parser heuristic",
        },
      ],
    };
  }
  return {
    ...ri,
    warnings: [
      ...ri.warnings,
      {
        code: "dialect_uncertain",
        message: "MLS dialect was uncertain; used RI State-Wide MLS parser heuristic",
      },
    ],
  };
}
