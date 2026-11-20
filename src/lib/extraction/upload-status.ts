/** UI-facing status labels mapped from source_documents.parse_status + local UX. */

export type UploadUiStatus =
  | "pending"
  | "uploading"
  | "processing"
  | "needs_review"
  | "complete"
  | "failed";

export function mapParseStatusToUi(
  parseStatus: string | null | undefined,
  local?: "pending" | "uploading" | "processing",
): UploadUiStatus {
  if (local) return local;
  switch (parseStatus) {
    case "uploaded":
      return "uploading";
    case "parsing":
      return "processing";
    case "needs_review":
      return "needs_review";
    case "parsed":
      return "complete";
    case "failed":
      return "failed";
    default:
      return "pending";
  }
}
