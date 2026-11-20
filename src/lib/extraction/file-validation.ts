import type { UploadableSourceType } from "./source-types";
import { isUploadableSourceType } from "./source-types";

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50MB matches bucket limit

const SOURCE_EXTENSIONS: Record<UploadableSourceType, string[]> = {
  rentometer_csv: ["csv"],
  rentometer_xlsx: ["xlsx", "xls"],
  rentometer_pdf: ["pdf"],
  hellodata_pdf: ["pdf"],
  mls_ri_pdf: ["pdf"],
  mls_ct_pdf: ["pdf"],
  zillow_xlsx: ["xlsx", "xls"],
  apartments_xlsx: ["xlsx", "xls"],
};

export interface FileValidationResult {
  ok: boolean;
  errors: string[];
  detectedFormat: "csv" | "xlsx" | "xls" | "pdf" | "unknown";
  extension: string | null;
}

function extensionOf(filename: string): string | null {
  const base = filename.split(/[/\\]/).pop() ?? "";
  const parts = base.toLowerCase().split(".");
  if (parts.length < 2) return null;
  return parts.at(-1) ?? null;
}

export function detectFileFormat(
  filename: string,
  bytes: Uint8Array,
): FileValidationResult["detectedFormat"] {
  if (bytes.length >= 5) {
    const head = String.fromCharCode(...bytes.slice(0, 5));
    if (head.startsWith("%PDF")) return "pdf";
  }
  if (bytes.length >= 4) {
    // ZIP/XLSX signature
    if (bytes[0] === 0x50 && bytes[1] === 0x4b && (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07)) {
      const ext = extensionOf(filename);
      if (ext === "xls") return "xls";
      return "xlsx";
    }
    // Legacy OLE XLS
    if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) {
      return "xls";
    }
  }

  const ext = extensionOf(filename);
  if (ext === "csv") return "csv";
  if (ext === "pdf") return "pdf";
  if (ext === "xlsx") return "xlsx";
  if (ext === "xls") return "xls";

  // Heuristic: printable text with commas
  const sample = String.fromCharCode(...bytes.slice(0, Math.min(bytes.length, 200)));
  if (sample.includes(",") && /^[\x09\x0a\x0d\x20-\x7e]+$/.test(sample)) {
    return "csv";
  }
  return "unknown";
}

export function validateUploadFile(opts: {
  filename: string;
  byteSize: number;
  bytes: Uint8Array;
  sourceType: UploadableSourceType;
}): FileValidationResult {
  const errors: string[] = [];
  const extension = extensionOf(opts.filename);
  const detectedFormat = detectFileFormat(opts.filename, opts.bytes);

  if (!opts.filename || opts.filename.includes("..") || opts.filename.includes("\0")) {
    errors.push("Unsafe filename");
  }
  if (opts.byteSize <= 0) {
    errors.push("Empty file");
  }
  if (opts.byteSize > MAX_UPLOAD_BYTES) {
    errors.push(`File exceeds ${MAX_UPLOAD_BYTES} byte limit`);
  }

  const allowedExt = SOURCE_EXTENSIONS[opts.sourceType];
  if (!extension || !allowedExt.includes(extension)) {
    errors.push(
      `Extension .${extension ?? "unknown"} is not valid for ${opts.sourceType}`,
    );
  }

  if (
    (opts.sourceType === "rentometer_pdf" ||
      opts.sourceType === "hellodata_pdf" ||
      opts.sourceType === "mls_ri_pdf" ||
      opts.sourceType === "mls_ct_pdf") &&
    detectedFormat !== "pdf"
  ) {
    errors.push("File content is not a PDF");
  }
  if (opts.sourceType === "rentometer_csv" && detectedFormat !== "csv") {
    errors.push("File content does not look like CSV");
  }
  if (
    (opts.sourceType === "rentometer_xlsx" ||
      opts.sourceType === "zillow_xlsx" ||
      opts.sourceType === "apartments_xlsx") &&
    detectedFormat !== "xlsx" &&
    detectedFormat !== "xls"
  ) {
    errors.push("File content does not look like Excel");
  }

  return {
    ok: errors.length === 0,
    errors,
    detectedFormat,
    extension,
  };
}

export function sourceTypeFromExplicit(value: string): UploadableSourceType | null {
  return isUploadableSourceType(value) ? value : null;
}
