export type UploadableSourceType =
  | "rentometer_csv"
  | "rentometer_xlsx"
  | "rentometer_pdf"
  | "hellodata_pdf"
  | "mls_ri_pdf"
  | "mls_ct_pdf"
  | "zillow_xlsx"
  | "apartments_xlsx";

export function isUploadableSourceType(value: string): value is UploadableSourceType {
  return (
    value === "rentometer_csv" ||
    value === "rentometer_xlsx" ||
    value === "rentometer_pdf" ||
    value === "hellodata_pdf" ||
    value === "mls_ri_pdf" ||
    value === "mls_ct_pdf" ||
    value === "zillow_xlsx" ||
    value === "apartments_xlsx"
  );
}
