import { describe, expect, it } from "vitest";
import { validateUploadFile } from "@/lib/extraction/file-validation";
import { sanitizeStorageFilename } from "@/lib/extraction/normalize";

describe("upload file validation", () => {
  it("accepts PDF magic bytes for rentometer_pdf and hellodata_pdf", () => {
    const bytes = new TextEncoder().encode("%PDF-1.4\n%...");
    expect(
      validateUploadFile({
        filename: "report.pdf",
        byteSize: bytes.byteLength,
        bytes,
        sourceType: "rentometer_pdf",
      }).ok,
    ).toBe(true);
    expect(
      validateUploadFile({
        filename: "hellodata.pdf",
        byteSize: bytes.byteLength,
        bytes,
        sourceType: "hellodata_pdf",
      }).ok,
    ).toBe(true);
  });

  it("rejects wrong type / malicious names", () => {
    const bytes = new TextEncoder().encode("%PDF-1.4");
    const wrong = validateUploadFile({
      filename: "report.pdf",
      byteSize: bytes.byteLength,
      bytes,
      sourceType: "rentometer_csv",
    });
    expect(wrong.ok).toBe(false);

    const badName = validateUploadFile({
      filename: "../etc/passwd.csv",
      byteSize: 10,
      bytes: new TextEncoder().encode("address,price\n"),
      sourceType: "rentometer_csv",
    });
    expect(badName.ok).toBe(false);
  });

  it("sanitizes storage filenames", () => {
    expect(sanitizeStorageFilename("../../a b?.csv")).toBe("a_b_.csv");
  });
});
