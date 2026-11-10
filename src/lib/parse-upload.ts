import Papa from "papaparse";
import * as XLSX from "xlsx";

export interface ParsedUploadResult {
  rows: Record<string, string | number>[];
  columns: string[];
  extractedFields: Record<string, string | number>;
  confidence: number;
  summary: string;
}

function normalizeKey(key: string) {
  return key.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

function inferFields(rows: Record<string, string | number>[]) {
  const fields: Record<string, string | number> = {};
  if (!rows.length) return fields;

  const first = rows[0]!;
  const keys = Object.keys(first);

  const find = (...candidates: string[]) =>
    keys.find((k) => candidates.some((c) => normalizeKey(k).includes(c)));

  const addressKey = find("address", "street", "property");
  const cityKey = find("city");
  const rentKey = find("rent", "asking", "price");
  const sqftKey = find("sqft", "sq_ft", "square");
  const unitKey = find("unit", "apt", "apartment");
  const bedsKey = find("bed", "br");
  const bathsKey = find("bath", "ba");

  if (addressKey) fields.address = String(first[addressKey] ?? "");
  if (cityKey) fields.city = String(first[cityKey] ?? "");
  if (unitKey) fields.unit = String(first[unitKey] ?? "");
  if (rentKey) {
    const raw = String(first[rentKey]).replace(/[^0-9.]/g, "");
    fields.askingRent = Number(raw) || String(first[rentKey]);
  }
  if (sqftKey) {
    const raw = String(first[sqftKey]).replace(/[^0-9.]/g, "");
    fields.sqft = Number(raw) || String(first[sqftKey]);
  }
  if (bedsKey) fields.beds = Number(String(first[bedsKey]).replace(/[^0-9.]/g, "")) || String(first[bedsKey]);
  if (bathsKey) fields.baths = Number(String(first[bathsKey]).replace(/[^0-9.]/g, "")) || String(first[bathsKey]);

  fields.rowCount = rows.length;
  fields.columnCount = keys.length;
  return fields;
}

export async function parseCsvFile(file: File): Promise<ParsedUploadResult> {
  const text = await file.text();
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  });
  const rows = (parsed.data || []).map((row) => {
    const out: Record<string, string | number> = {};
    Object.entries(row).forEach(([k, v]) => {
      const num = Number(String(v).replace(/[$,]/g, ""));
      out[k] = Number.isFinite(num) && String(v).match(/[0-9]/) ? num : v;
    });
    return out;
  });
  const columns = parsed.meta.fields ?? Object.keys(rows[0] ?? {});
  const extractedFields = inferFields(rows);
  return {
    rows,
    columns,
    extractedFields,
    confidence: rows.length ? 0.86 + Math.min(rows.length, 20) * 0.004 : 0.4,
    summary: `Parsed ${rows.length} rows and ${columns.length} columns from CSV.`,
  };
}

export async function parseExcelFile(file: File): Promise<ParsedUploadResult> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return {
      rows: [],
      columns: [],
      extractedFields: {},
      confidence: 0.2,
      summary: "No worksheets found in workbook.",
    };
  }
  const sheet = workbook.Sheets[sheetName]!;
  const json = XLSX.utils.sheet_to_json<Record<string, string | number>>(sheet, {
    defval: "",
  });
  const columns = json.length ? Object.keys(json[0]!) : [];
  const extractedFields = inferFields(json);
  return {
    rows: json,
    columns,
    extractedFields,
    confidence: json.length ? 0.88 + Math.min(json.length, 20) * 0.003 : 0.35,
    summary: `Parsed sheet “${sheetName}” with ${json.length} rows.`,
  };
}

export async function simulatePdfExtraction(file: File): Promise<ParsedUploadResult> {
  // Demo simulation — no OCR. Returns structured fields inspired by the Veterans report.
  const sizeKb = Math.round(file.size / 1024);
  return {
    rows: [
      {
        unit: "A104",
        beds: 1,
        baths: 1,
        sqft: 896,
        askingRent: 1975,
      },
      {
        unit: "A210",
        beds: 1,
        baths: 1,
        sqft: 807,
        askingRent: 2100,
      },
      {
        unit: "A207",
        beds: 1,
        baths: 1,
        sqft: 753,
        askingRent: 2200,
      },
    ],
    columns: ["unit", "beds", "baths", "sqft", "askingRent"],
    extractedFields: {
      propertyName: "30 Veterans Memorial Parkway",
      marketingName: "The Residences at Bold Point",
      address: "30 Veterans Memorial Pkwy, East Providence, RI 02914",
      yearBuilt: 2021,
      unitCount: 34,
      stories: 3,
      recommendedLow: 2075,
      recommendedHigh: 2200,
      blendedAverage: 2082,
      fileSizeKb: sizeKb,
    },
    confidence: 0.91,
    summary:
      "Simulated AI extraction mapped subject property, three available units, and pricing recommendation fields from PDF layout.",
  };
}
