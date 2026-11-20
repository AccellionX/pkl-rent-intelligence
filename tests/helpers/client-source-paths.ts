/**
 * Optional local paths to confidential client source files for regression tests.
 * Never hardcode machine usernames or absolute Downloads paths in the repo.
 *
 * Set PKL_CLIENT_SOURCE_DIR to a folder that contains the client packages, e.g.:
 *   855 Providence St - 2BR Report Package/
 *   30 Veterans 1BR report - source files/
 * Or set per-file overrides (PKL_MLS_RI_PDF, PKL_RENTOMETER_855_CSV, …).
 */
import path from "node:path";

export function clientSourceRoot(): string | null {
  const root = process.env.PKL_CLIENT_SOURCE_DIR?.trim();
  return root || null;
}

export function clientFile(...parts: string[]): string | null {
  const root = clientSourceRoot();
  if (!root) return null;
  return path.join(root, ...parts);
}

export const CLIENT_REL = {
  rentometer855Csv: [
    "855 Providence St - 2BR Report Package",
    "3 Source files",
    "20261114-Rentometer-855_Providence_St_West_Warwick_RI_02893_USA-2-bed-qPiKWT24DL0.csv",
  ],
  rentometer855Pdf: [
    "855 Providence St - 2BR Report Package",
    "3 Source files",
    "20261114-Rentometer-855_Providence_St_West_Warwick_RI_02893_USA-2-bed-qPiKWT24DL0.pdf",
  ],
  hellodata855Pdf: [
    "855 Providence St - 2BR Report Package",
    "3 Source files",
    "855_Providence_St_-11-14-2026.pdf",
  ],
  hellodataVeteransPdf: [
    "30 Veterans 1BR report - source files",
    "06 HelloData report 11-08-2026.pdf",
  ],
  mlsRiVeteransPdf: [
    "30 Veterans 1BR report - source files",
    "05 RI MLS CMA report 11-01-2026.pdf",
  ],
  zillow855Xlsx: [
    "855 Providence St - 2BR Report Package",
    "3 Source files",
    "Zillow__Listing_performance__1_.xlsx",
  ],
  apartments855Xlsx: [
    "855 Providence St - 2BR Report Package",
    "3 Source files",
    "Apartment_com-_855_Providence_St.xlsx",
  ],
  zillowVeteransXlsx: [
    "30 Veterans 1BR report - source files",
    "03 Zillow listing performance 10-22-2026.xlsx",
  ],
  apartmentsVeteransXlsx: [
    "30 Veterans 1BR report - source files",
    "04 Apartments.com report 10-22-2026.xlsx",
  ],
} as const;

export function resolveClientPath(
  envKey: string,
  ...relativeParts: string[]
): string | null {
  const fromEnv = process.env[envKey]?.trim();
  if (fromEnv) return fromEnv;
  return clientFile(...relativeParts);
}
