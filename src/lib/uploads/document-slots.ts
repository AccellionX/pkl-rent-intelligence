import type { UploadableSourceType } from "@/lib/extraction/source-types";

/** Weekly / property upload pack — one slot per staff-facing document kind. */
export type DocumentSlotId =
  | "rentometer"
  | "hellodata"
  | "mls_ri"
  | "mls_ct"
  | "zillow"
  | "apartments";

export type DocumentSlotDef = {
  id: DocumentSlotId;
  label: string;
  description: string;
  /** Concrete API source types this slot covers. */
  sourceTypes: UploadableSourceType[];
  /** File input accept attribute. */
  accept: string;
  /** Default when format cannot be inferred (non-Rentometer slots). */
  defaultSourceType: UploadableSourceType;
};

export const DOCUMENT_SLOTS: DocumentSlotDef[] = [
  {
    id: "rentometer",
    label: "Rentometer",
    description: "CSV, Excel, or PDF export",
    sourceTypes: ["rentometer_csv", "rentometer_xlsx", "rentometer_pdf"],
    accept: ".csv,.xlsx,.xls,.pdf",
    defaultSourceType: "rentometer_csv",
  },
  {
    id: "hellodata",
    label: "HelloData",
    description: "Comparable market PDF",
    sourceTypes: ["hellodata_pdf"],
    accept: ".pdf",
    defaultSourceType: "hellodata_pdf",
  },
  {
    id: "mls_ri",
    label: "RI State-Wide MLS",
    description: "MLS listing PDF",
    sourceTypes: ["mls_ri_pdf"],
    accept: ".pdf",
    defaultSourceType: "mls_ri_pdf",
  },
  {
    id: "mls_ct",
    label: "CT connectMLS",
    description: "MLS listing PDF",
    sourceTypes: ["mls_ct_pdf"],
    accept: ".pdf",
    defaultSourceType: "mls_ct_pdf",
  },
  {
    id: "zillow",
    label: "Zillow",
    description: "Listing performance Excel",
    sourceTypes: ["zillow_xlsx"],
    accept: ".xlsx,.xls",
    defaultSourceType: "zillow_xlsx",
  },
  {
    id: "apartments",
    label: "Apartments.com",
    description: "Leads Excel",
    sourceTypes: ["apartments_xlsx"],
    accept: ".xlsx,.xls",
    defaultSourceType: "apartments_xlsx",
  },
];

export function getDocumentSlot(id: DocumentSlotId): DocumentSlotDef {
  const slot = DOCUMENT_SLOTS.find((s) => s.id === id);
  if (!slot) throw new Error(`Unknown document slot: ${id}`);
  return slot;
}

export function slotIdForSourceType(sourceType: string): DocumentSlotId | null {
  for (const slot of DOCUMENT_SLOTS) {
    if (slot.sourceTypes.includes(sourceType as UploadableSourceType)) {
      return slot.id;
    }
  }
  return null;
}

function extensionOf(filename: string): string | null {
  const base = filename.split(/[/\\]/).pop() ?? "";
  const parts = base.toLowerCase().split(".");
  if (parts.length < 2) return null;
  return parts.at(-1) ?? null;
}

/**
 * Pick the concrete API source type for a slot from the chosen file.
 * Rentometer maps by extension; other slots use their single default.
 */
export function resolveSourceTypeForSlot(
  slotId: DocumentSlotId,
  filename: string,
): UploadableSourceType {
  const slot = getDocumentSlot(slotId);
  if (slotId !== "rentometer") return slot.defaultSourceType;

  const ext = extensionOf(filename);
  if (ext === "pdf") return "rentometer_pdf";
  if (ext === "xlsx" || ext === "xls") return "rentometer_xlsx";
  return "rentometer_csv";
}

export type SlotDocumentRef = {
  id: string;
  originalFilename: string;
  sourceType: string;
  parseStatus: string;
  reportRunId?: string | null;
  uploadedAt: string;
};

export type SlotUploadStatus = {
  slotId: DocumentSlotId;
  uploaded: boolean;
  failed: boolean;
  document: SlotDocumentRef | null;
};

/**
 * Match the latest useful document to each slot.
 * When reportRunId is set, prefer docs on that report, then property-level.
 */
export function summarizeSlotUploads(opts: {
  documents: SlotDocumentRef[];
  reportRunId?: string | null;
}): SlotUploadStatus[] {
  const reportId = String(opts.reportRunId ?? "").trim() || null;

  const sorted = [...opts.documents].sort(
    (a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime(),
  );

  return DOCUMENT_SLOTS.map((slot) => {
    const candidates = sorted.filter((d) =>
      slot.sourceTypes.includes(d.sourceType as UploadableSourceType),
    );
    const reportScoped = reportId
      ? candidates.filter((d) => String(d.reportRunId ?? "") === reportId)
      : [];
    const propertyLevel = candidates.filter((d) => !d.reportRunId);
    const pool =
      reportScoped.length > 0
        ? reportScoped
        : reportId
          ? propertyLevel.length > 0
            ? propertyLevel
            : candidates
          : candidates;

    const document = pool[0] ?? null;
    const failed = Boolean(document && document.parseStatus === "failed");
    const uploaded = Boolean(document && document.parseStatus !== "failed");

    return {
      slotId: slot.id,
      uploaded,
      failed,
      document,
    };
  });
}
