"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Building2, RotateCcw } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/ui/empty-state";
import { PropertyNav } from "@/components/buildings/property-nav";
import { PsfScatterChart } from "@/components/charts/psf-scatter-chart";
import { RentComparisonChart } from "@/components/charts/rent-comparison-chart";
import { getBuilding, getUnitsForBuilding, useDemoStore } from "@/store/demo-store";
import {
  veteransComparables,
  veteransRecommendation,
  VETERANS_BUILDING_ID,
} from "@/data/veterans";
import { formatCurrency, formatPsf } from "@/lib/utils";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

export default function PricingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const { id } = use(params);
  const building = getBuilding(id);
  const units = getUnitsForBuilding(id).filter((u) => u.status === "available");
  const getUnitRent = useDemoStore((s) => s.getUnitRent);
  const updateUnitRent = useDemoStore((s) => s.updateUnitRent);
  const recommendation = useDemoStore((s) => s.recommendation);
  const updateRecommendation = useDemoStore((s) => s.updateRecommendation);
  const selectedCompIds = useDemoStore((s) => s.selectedCompIds);
  const [draftRec, setDraftRec] = useState({
    low: recommendation.low,
    high: recommendation.high,
  });

  const liveUnits = useMemo(
    () =>
      units.map((u) => {
        const askingRent = getUnitRent(u.id, u.askingRent);
        return { ...u, askingRent, psf: askingRent / u.sqft };
      }),
    [units, getUnitRent],
  );

  const selectedComps = veteransComparables.filter((c) =>
    selectedCompIds.includes(c.id),
  );

  const chartData = [
    ...selectedComps.map((c) => ({
      name: c.name.length > 16 ? `${c.name.slice(0, 14)}…` : c.name,
      rent: Math.round((c.rentMin + c.rentMax) / 2),
    })),
    ...liveUnits.map((u) => ({
      name: `Subject ${u.unitNumber}`,
      rent: u.askingRent,
      isSubject: true,
    })),
  ];

  const scatterComps = selectedComps.map((c) => ({
    name: c.name,
    sqft: Math.round((c.sqftMin + c.sqftMax) / 2),
    rent: Math.round((c.rentMin + c.rentMax) / 2),
    psf: c.psf,
  }));

  const scatterSubject = liveUnits.map((u) => ({
    name: u.unitNumber,
    sqft: u.sqft,
    rent: u.askingRent,
    psf: u.psf,
  }));

  if (!building || id !== VETERANS_BUILDING_ID) {
    return (
      <div>
        <Topbar title="Pricing" />
        <div className="px-6 py-5">
          <EmptyState
            icon={Building2}
            title="Pricing workspace is on the featured property"
            description="Open 30 Veterans to adjust asking rents and recommendations."
            actionLabel="Open 30 Veterans pricing"
            onAction={() => {
              router.push(`/buildings/${VETERANS_BUILDING_ID}/pricing`);
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div>
      <Topbar
        title="Pricing Analysis"
        subtitle={`Recommendation ${formatCurrency(recommendation.low)}–${formatCurrency(recommendation.high)} / month`}
      />
      <div className="px-6 py-5">
        <Breadcrumbs
          items={[
            { label: "Portfolio", href: "/" },
            { label: "Buildings", href: "/buildings" },
            { label: building.name, href: `/buildings/${id}` },
            { label: "Pricing" },
          ]}
        />
        <PropertyNav buildingId={id} />

        <div className="mb-5 rounded-xl border border-navy/10 bg-navy p-5 text-white shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <Badge variant="gold">Our recommendation</Badge>
              <div className="mt-2 font-display text-3xl font-semibold">
                {formatCurrency(recommendation.low)} – {formatCurrency(recommendation.high)}{" "}
                <span className="text-lg font-normal text-white/70">/ month</span>
              </div>
              <p className="mt-2 max-w-3xl text-sm text-white/70">
                Current asking rents sit inside the comp range of{" "}
                {formatCurrency(recommendation.rangeLow)}–
                {formatCurrency(recommendation.rangeHigh)}. Blended average across selected
                comps: {formatCurrency(recommendation.blendedAverage)} (
                {formatPsf(recommendation.averagePsf)}).
              </p>
            </div>
            <Button asChild variant="gold">
              <Link href={`/buildings/${id}/reports`}>
                Generate PDF <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>

        <div className="mb-6 grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Adjust available unit rents</CardTitle>
              <CardDescription>Changes persist in browser localStorage</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {liveUnits.map((u) => (
                <div
                  key={u.id}
                  className="grid grid-cols-[1fr_140px_90px] items-end gap-3 rounded-lg border border-border p-3"
                >
                  <div>
                    <div className="font-medium text-navy">
                      Unit {u.unitNumber}
                      <span className="ml-2 text-xs font-normal text-ink-muted">
                        {u.sqft} sf · {u.beds}bd/{u.baths}ba
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-ink-muted">
                      {formatPsf(u.psf)} · market {formatCurrency(u.marketRent)}
                    </div>
                  </div>
                  <div>
                    <Label htmlFor={`rent-${u.id}`} className="text-xs text-ink-subtle">
                      Asking rent
                    </Label>
                    <Input
                      id={`rent-${u.id}`}
                      type="number"
                      value={u.askingRent}
                      onChange={(e) => {
                        const value = Number(e.target.value);
                        if (!Number.isFinite(value)) return;
                        updateUnitRent(id, u.id, value);
                      }}
                      onBlur={() => toast.success(`Updated ${u.unitNumber}`)}
                    />
                  </div>
                  <div className="pb-2 text-right text-sm font-medium text-navy">
                    {formatCurrency(u.askingRent)}
                  </div>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  liveUnits.forEach((u) => {
                    const original = units.find((x) => x.id === u.id);
                    if (original) updateUnitRent(id, u.id, original.askingRent);
                  });
                  toast.message("Rents reset to report values");
                }}
              >
                <RotateCcw className="h-4 w-4" /> Reset unit rents
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Tune recommendation band</CardTitle>
              <CardDescription>Used in PDF generation & history</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="rec-low">Recommended low</Label>
                  <Input
                    id="rec-low"
                    type="number"
                    value={draftRec.low}
                    onChange={(e) =>
                      setDraftRec((d) => ({ ...d, low: Number(e.target.value) }))
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="rec-high">Recommended high</Label>
                  <Input
                    id="rec-high"
                    type="number"
                    value={draftRec.high}
                    onChange={(e) =>
                      setDraftRec((d) => ({ ...d, high: Number(e.target.value) }))
                    }
                  />
                </div>
              </div>
              <Button
                onClick={() => {
                  updateRecommendation({ low: draftRec.low, high: draftRec.high });
                  toast.success("Recommendation updated");
                }}
              >
                Save recommendation
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setDraftRec({
                    low: veteransRecommendation.low,
                    high: veteransRecommendation.high,
                  });
                  updateRecommendation({
                    low: veteransRecommendation.low,
                    high: veteransRecommendation.high,
                  });
                  toast.message("Recommendation restored");
                }}
              >
                Restore report defaults
              </Button>
              <div className="rounded-lg bg-surface-muted/80 p-3 text-xs leading-relaxed text-ink-muted">
                {recommendation.narrative.slice(0, 320)}…
              </div>
              <div className="space-y-2">
                <div className="text-xs font-medium uppercase tracking-wider text-ink-subtle">
                  This week&apos;s actions
                </div>
                {recommendation.actions.map((a) => (
                  <div key={a} className="rounded-md border border-border px-3 py-2 text-sm">
                    {a}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Asking rents vs comps</CardTitle>
            </CardHeader>
            <CardContent>
              <RentComparisonChart
                data={chartData}
                subjectAvg={
                  liveUnits.reduce((s, u) => s + u.askingRent, 0) / Math.max(liveUnits.length, 1)
                }
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Rent vs square footage</CardTitle>
              <CardDescription>Gold = subject units · Navy = comps</CardDescription>
            </CardHeader>
            <CardContent>
              <PsfScatterChart comps={scatterComps} subject={scatterSubject} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
