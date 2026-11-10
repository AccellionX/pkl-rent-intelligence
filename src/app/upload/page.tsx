"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  FileSpreadsheet,
  FileText,
  Loader2,
  Sparkles,
  UploadCloud,
} from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { seedBuildings } from "@/data/portfolio-seed";
import { VETERANS_BUILDING_ID } from "@/data/veterans";
import { useDemoStore } from "@/store/demo-store";
import {
  parseCsvFile,
  parseExcelFile,
  simulatePdfExtraction,
} from "@/lib/parse-upload";
import { createId, sleep } from "@/lib/utils";
import { toast } from "sonner";

function UploadContent() {
  const searchParams = useSearchParams();
  const initialBuilding = searchParams.get("buildingId") ?? VETERANS_BUILDING_ID;
  const [buildingId, setBuildingId] = useState(initialBuilding);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [preview, setPreview] = useState<{
    columns: string[];
    rows: Record<string, string | number>[];
    summary: string;
  } | null>(null);
  const uploads = useDemoStore((s) => s.uploads);
  const addUpload = useDemoStore((s) => s.addUpload);
  const updateUpload = useDemoStore((s) => s.updateUpload);

  const buildingOptions = useMemo(
    () =>
      [...seedBuildings]
        .sort((a, b) => Number(!!b.isFeatured) - Number(!!a.isFeatured) || a.name.localeCompare(b.name))
        .slice(0, 40),
    [],
  );

  async function handleFile(file: File) {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!ext || !["pdf", "xlsx", "xls", "csv"].includes(ext)) {
      toast.error("Supported formats: PDF, Excel, CSV");
      return;
    }

    const fileType = ext === "pdf" ? "pdf" : ext === "csv" ? "csv" : "xlsx";
    const uploadId = createId("up");
    addUpload({
      id: uploadId,
      fileName: file.name,
      fileType,
      uploadedAt: new Date().toISOString(),
      buildingId,
      status: "processing",
      extractedFields: {},
      confidence: 0,
    });

    setProcessing(true);
    setProgress(12);
    setPreview(null);

    try {
      const tick = window.setInterval(() => {
        setProgress((p) => Math.min(p + 11, 88));
      }, 180);

      await sleep(700);

      let result;
      if (fileType === "csv") result = await parseCsvFile(file);
      else if (fileType === "xlsx") result = await parseExcelFile(file);
      else result = await simulatePdfExtraction(file);

      clearInterval(tick);
      setProgress(100);
      await sleep(250);

      updateUpload(uploadId, {
        status: "complete",
        extractedFields: result.extractedFields,
        confidence: result.confidence,
      });
      setPreview({
        columns: result.columns,
        rows: result.rows.slice(0, 8),
        summary: result.summary,
      });
      toast.success(
        fileType === "pdf"
          ? "Simulated AI extraction complete"
          : "File parsed successfully",
        { description: result.summary },
      );
    } catch (err) {
      console.error(err);
      updateUpload(uploadId, { status: "failed", confidence: 0 });
      toast.error("Could not process file");
    } finally {
      setProcessing(false);
      setTimeout(() => setProgress(0), 600);
    }
  }

  return (
    <div>
      <Topbar
        title="AI Document Upload"
        subtitle="PDF extraction is simulated · CSV/Excel use real client-side parsing"
      />
      <div className="px-6 py-5">
        <Breadcrumbs
          items={[{ label: "Portfolio", href: "/" }, { label: "AI Upload" }]}
        />

        <div className="mb-4 flex flex-wrap gap-2">
          <Badge variant="gold">Demo AI</Badge>
          <Badge variant="outline">No paid OCR / LLM APIs</Badge>
        </div>

        <div className="grid gap-6 lg:grid-cols-5">
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle>Upload comps or unit schedule</CardTitle>
              <CardDescription>
                Drop a PDF for simulated extraction, or CSV/Excel for real parsing
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="mb-2 text-sm font-medium">Associate with building</div>
                <Select value={buildingId} onValueChange={setBuildingId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select building" />
                  </SelectTrigger>
                  <SelectContent>
                    {buildingOptions.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                        {b.isFeatured ? " ★" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) void handleFile(file);
                }}
                className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-14 text-center transition-colors ${
                  dragging
                    ? "border-gold bg-gold/10"
                    : "border-border bg-surface/60 hover:border-gold/40"
                }`}
              >
                <UploadCloud className="mb-3 h-8 w-8 text-navy" />
                <div className="font-medium text-navy">Drop a file here</div>
                <p className="mt-1 max-w-sm text-sm text-ink-muted">
                  PDF · XLSX · CSV. Large Excel files parse in-browser with SheetJS.
                </p>
                <label className="mt-4">
                  <input
                    type="file"
                    accept=".pdf,.xlsx,.xls,.csv"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handleFile(file);
                      e.target.value = "";
                    }}
                  />
                  <Button asChild variant="default">
                    <span>Browse files</span>
                  </Button>
                </label>
              </div>

              {processing && (
                <div className="space-y-2 rounded-lg border border-border p-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-navy">
                    <Sparkles className="h-4 w-4 text-gold" />
                    {progress < 90 ? "Extracting structured fields…" : "Finalizing…"}
                  </div>
                  <Progress value={progress} />
                </div>
              )}

              {preview && (
                <div className="space-y-3 rounded-lg border border-border p-4">
                  <div className="flex items-center gap-2">
                    <FileSpreadsheet className="h-4 w-4 text-navy" />
                    <span className="text-sm font-medium">{preview.summary}</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[480px] text-left text-xs">
                      <thead className="border-b border-border text-ink-subtle">
                        <tr>
                          {preview.columns.map((c) => (
                            <th key={c} className="px-2 py-1.5 font-medium">
                              {c}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {preview.rows.map((row, idx) => (
                          <tr key={idx} className="border-b border-border/60">
                            {preview.columns.map((c) => (
                              <td key={c} className="px-2 py-1.5">
                                {String(row[c] ?? "")}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Extraction history</CardTitle>
              <CardDescription>Saved in localStorage</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {uploads.length === 0 ? (
                <EmptyState
                  icon={FileText}
                  title="No uploads yet"
                  description="Upload a CSV of comps or a PDF pricing packet to see extracted fields."
                />
              ) : (
                uploads.map((u) => (
                  <div key={u.id} className="rounded-lg border border-border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-navy">
                          {u.fileName}
                        </div>
                        <div className="mt-1 text-xs text-ink-muted">
                          {new Date(u.uploadedAt).toLocaleString()} · {u.fileType.toUpperCase()}
                        </div>
                      </div>
                      <Badge
                        variant={
                          u.status === "complete"
                            ? "success"
                            : u.status === "failed"
                              ? "danger"
                              : "warning"
                        }
                      >
                        {u.status === "processing" ? (
                          <span className="inline-flex items-center gap-1">
                            <Loader2 className="h-3 w-3 animate-spin" /> processing
                          </span>
                        ) : (
                          u.status
                        )}
                      </Badge>
                    </div>
                    {u.status === "complete" && (
                      <div className="mt-2 text-xs text-ink-muted">
                        Confidence {Math.round(u.confidence * 100)}% ·{" "}
                        {Object.keys(u.extractedFields).length} fields
                      </div>
                    )}
                    {u.status === "complete" && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {Object.entries(u.extractedFields)
                          .slice(0, 4)
                          .map(([k, v]) => (
                            <Badge key={k} variant="secondary">
                              {k}: {String(v)}
                            </Badge>
                          ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function UploadPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-ink-muted">Loading upload…</div>}>
      <UploadContent />
    </Suspense>
  );
}
