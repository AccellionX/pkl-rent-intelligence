"use client";

import { use, useState } from "react";
import Link from "next/link";
import { Building2, Download, FileText, Loader2 } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/ui/empty-state";
import { PropertyNav } from "@/components/buildings/property-nav";
import {
  getBuilding,
  getUnitsForBuilding,
  useDemoStore,
} from "@/store/demo-store";
import {
  veteransComparables,
  VETERANS_BUILDING_ID,
} from "@/data/veterans";
import { generatePricingReportPdf } from "@/lib/pdf-report";
import { createId, formatCurrency, sleep } from "@/lib/utils";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

export default function BuildingReportsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const { id } = use(params);
  const building = getBuilding(id);
  const allUnits = getUnitsForBuilding(id).filter((u) => u.status === "available");
  const getUnitRent = useDemoStore((s) => s.getUnitRent);
  const recommendation = useDemoStore((s) => s.recommendation);
  const selectedCompIds = useDemoStore((s) => s.selectedCompIds);
  const reports = useDemoStore((s) => s.reports);
  const addReport = useDemoStore((s) => s.addReport);
  const [selectedUnits, setSelectedUnits] = useState<string[]>(
    allUnits.map((u) => u.id),
  );
  const [generating, setGenerating] = useState(false);

  const buildingReports = reports.filter((r) => r.buildingId === id);

  if (!building || id !== VETERANS_BUILDING_ID) {
    return (
      <div>
        <Topbar title="Reports" />
        <div className="px-6 py-5">
          <EmptyState
            icon={Building2}
            title="PDF generator is wired for 30 Veterans"
            description="The branded report uses the source pricing document layout and figures."
            actionLabel="Open report generator"
            onAction={() => {
              router.push(`/buildings/${VETERANS_BUILDING_ID}/reports`);
            }}
          />
        </div>
      </div>
    );
  }

  async function handleGenerate() {
    if (!building) return;
    if (!selectedUnits.length) {
      toast.error("Select at least one unit");
      return;
    }
    setGenerating(true);
    try {
      await sleep(900);
      const units = allUnits
        .filter((u) => selectedUnits.includes(u.id))
        .map((u) => {
          const askingRent = getUnitRent(u.id, u.askingRent);
          return { ...u, askingRent, psf: askingRent / u.sqft };
        });
      const comps = veteransComparables.filter((c) => selectedCompIds.includes(c.id));
      const filename = generatePricingReportPdf({
        building,
        units,
        comps,
        recommendation,
      });
      const now = new Date();
      const report = {
        id: createId("rpt"),
        buildingId: building.id,
        buildingName: building.name,
        unitIds: units.map((u) => u.id),
        unitLabels: units.map((u) => u.unitNumber),
        title: `Rental Pricing Analysis — ${now.toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        })}`,
        createdAt: now.toISOString(),
        preparedBy: "Ria Driscoll",
        recommendedLow: recommendation.low,
        recommendedHigh: recommendation.high,
        status: "generated" as const,
        notes: `Downloaded as ${filename}`,
      };
      addReport(report);
      toast.success("PDF downloaded", {
        description: "Report also saved to history in localStorage.",
      });
    } catch (err) {
      console.error(err);
      toast.error("Failed to generate PDF");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div>
      <Topbar
        title="Generate Report"
        subtitle="Branded PDF matching the PKL pricing analysis layout"
      />
      <div className="px-6 py-5">
        <Breadcrumbs
          items={[
            { label: "Portfolio", href: "/" },
            { label: "Buildings", href: "/buildings" },
            { label: building.name, href: `/buildings/${id}` },
            { label: "Reports" },
          ]}
        />
        <PropertyNav buildingId={id} />

        <div className="grid gap-6 lg:grid-cols-5">
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle>Report builder</CardTitle>
              <CardDescription>
                Includes subject summary, available units, recommendation, comps table, and
                weekly actions
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <div className="mb-2 text-sm font-medium text-navy">Include units</div>
                <div className="space-y-2">
                  {allUnits.map((u) => {
                    const rent = getUnitRent(u.id, u.askingRent);
                    const checked = selectedUnits.includes(u.id);
                    return (
                      <label
                        key={u.id}
                        className="flex cursor-pointer items-center justify-between rounded-lg border border-border px-3 py-2.5"
                      >
                        <div className="flex items-center gap-3">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(value) => {
                              setSelectedUnits((prev) =>
                                value
                                  ? [...prev, u.id]
                                  : prev.filter((x) => x !== u.id),
                              );
                            }}
                          />
                          <div>
                            <div className="text-sm font-medium">Unit {u.unitNumber}</div>
                            <div className="text-xs text-ink-muted">
                              {u.sqft} sf · {formatCurrency(rent)}
                            </div>
                          </div>
                        </div>
                        <Badge variant="outline">{u.status}</Badge>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-lg bg-surface-muted/80 p-4 text-sm">
                <div className="font-medium text-navy">Will include</div>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-ink-muted">
                  <li>
                    Recommendation {formatCurrency(recommendation.low)}–
                    {formatCurrency(recommendation.high)}
                  </li>
                  <li>{selectedCompIds.length} selected comparables</li>
                  <li>Narrative & weekly action items from the source report</li>
                </ul>
              </div>

              <Button onClick={handleGenerate} disabled={generating} variant="gold" size="lg">
                {generating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Generating PDF…
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4" /> Download branded PDF
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Building report history</CardTitle>
              <CardDescription>Organized by this property</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {buildingReports.length === 0 ? (
                <p className="text-sm text-ink-muted">No reports yet for this building.</p>
              ) : (
                buildingReports.map((r) => (
                  <div
                    key={r.id}
                    className="rounded-lg border border-border px-3 py-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-navy">{r.title}</div>
                        <div className="mt-1 text-xs text-ink-muted">
                          Units {r.unitLabels.join(", ")} ·{" "}
                          {new Date(r.createdAt).toLocaleString()}
                        </div>
                      </div>
                      <FileText className="h-4 w-4 text-gold" />
                    </div>
                    <div className="mt-2 text-xs text-ink-muted">
                      Rec {formatCurrency(r.recommendedLow)}–
                      {formatCurrency(r.recommendedHigh)}
                    </div>
                  </div>
                ))
              )}
              <Button asChild variant="outline" size="sm" className="w-full">
                <Link href="/reports">View all report history</Link>
              </Button>
              <div className="pt-1">
                <Label className="text-xs text-ink-subtle">Demo note</Label>
                <p className="mt-1 text-xs text-ink-muted">
                  PDFs download locally. History entries persist via localStorage only.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
