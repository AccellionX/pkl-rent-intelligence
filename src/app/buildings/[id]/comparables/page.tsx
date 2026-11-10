"use client";

import { use, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Building2 } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { PropertyNav } from "@/components/buildings/property-nav";
import { RentComparisonChart } from "@/components/charts/rent-comparison-chart";
import { getBuilding, useDemoStore } from "@/store/demo-store";
import {
  excludedComparables,
  veteransComparables,
  VETERANS_BUILDING_ID,
} from "@/data/veterans";
import { formatCurrency, formatPsf } from "@/lib/utils";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

const matchVariant = {
  strongest: "success" as const,
  moderate: "info" as const,
  context: "secondary" as const,
};

export default function ComparablesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const { id } = use(params);
  const building = getBuilding(id);
  const selectedCompIds = useDemoStore((s) => s.selectedCompIds);
  const toggleComp = useDemoStore((s) => s.toggleComp);
  const setSelectedComps = useDemoStore((s) => s.setSelectedComps);

  const selected = useMemo(
    () => veteransComparables.filter((c) => selectedCompIds.includes(c.id)),
    [selectedCompIds],
  );

  const chartData = useMemo(() => {
    const rows = selected.map((c) => ({
      name: c.name.length > 18 ? `${c.name.slice(0, 16)}…` : c.name,
      rent: Math.round((c.rentMin + c.rentMax) / 2),
    }));
    rows.push({ name: "Subject", rent: 2092, isSubject: true } as {
      name: string;
      rent: number;
      isSubject?: boolean;
    });
    return rows;
  }, [selected]);

  if (!building || id !== VETERANS_BUILDING_ID) {
    return (
      <div>
        <Topbar title="Comparables" />
        <div className="px-6 py-5">
          <EmptyState
            icon={Building2}
            title="Comparables available on featured property"
            description="Open 30 Veterans Memorial Parkway to explore the nine-comp set from the pricing report."
            actionLabel="Go to 30 Veterans"
            onAction={() => {
              router.push(`/buildings/${VETERANS_BUILDING_ID}/comparables`);
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div>
      <Topbar
        title="Rental Comparables"
        subtitle="Nine 1BR/1BA units within 5 miles · sample verified listings"
      />
      <div className="px-6 py-5">
        <Breadcrumbs
          items={[
            { label: "Portfolio", href: "/" },
            { label: "Buildings", href: "/buildings" },
            { label: building.name, href: `/buildings/${id}` },
            { label: "Comparables" },
          ]}
        />
        <PropertyNav buildingId={id} />

        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-ink-muted">
              Toggle comps to refresh charts. Selection is saved in localStorage.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSelectedComps(veteransComparables.map((c) => c.id));
                toast.success("All comparables selected");
              }}
            >
              Select all
            </Button>
            <Button asChild variant="gold" size="sm">
              <Link href={`/buildings/${id}/pricing`}>
                Continue to pricing <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>

        <div className="mb-6 grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Rent comparison</CardTitle>
              <CardDescription>
                Midpoint rent for selected comps vs subject average asking
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RentComparisonChart data={chartData} subjectAvg={2092} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Selection summary</CardTitle>
              <CardDescription>{selected.length} of 9 comps active</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-ink-muted">Avg midpoint rent</span>
                <span className="font-semibold text-navy">
                  {selected.length
                    ? formatCurrency(
                        Math.round(
                          selected.reduce((s, c) => s + (c.rentMin + c.rentMax) / 2, 0) /
                            selected.length,
                        ),
                      )
                    : "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-muted">Avg $/sq ft</span>
                <span className="font-semibold text-navy">
                  {selected.length
                    ? formatPsf(
                        selected.reduce((s, c) => s + c.psf, 0) / selected.length,
                      )
                    : "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-muted">Avg distance</span>
                <span className="font-semibold text-navy">
                  {selected.length
                    ? `${(
                        selected.reduce((s, c) => s + c.distanceMiles, 0) / selected.length
                      ).toFixed(1)} mi`
                    : "—"}
                </span>
              </div>
              <p className="rounded-lg bg-surface-muted/80 p-3 text-xs text-ink-muted">
                How we chose comps: Rentometer & HelloData pulls, verified on Zillow,
                Apartments.com, and RI State-Wide MLS. Sample methodology — not a live feed.
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {veteransComparables.map((comp) => {
            const checked = selectedCompIds.includes(comp.id);
            return (
              <Card
                key={comp.id}
                className={`overflow-hidden transition-all ${checked ? "ring-1 ring-gold/40" : "opacity-80"}`}
              >
                <div className="relative h-36">
                  <Image
                    src={comp.imageUrl}
                    alt={comp.name}
                    fill
                    className="object-cover"
                    sizes="400px"
                  />
                  <div className="absolute left-3 top-3">
                    <Badge variant={matchVariant[comp.match]}>{comp.match} match</Badge>
                  </div>
                </div>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-base">{comp.name}</CardTitle>
                      <CardDescription>
                        {comp.distanceMiles} mi · {comp.source}
                      </CardDescription>
                    </div>
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => {
                        toggleComp(comp.id);
                        toast.message(checked ? "Comp removed" : "Comp included", {
                          description: comp.name,
                        });
                      }}
                      aria-label={`Toggle ${comp.name}`}
                    />
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <div className="text-xs text-ink-subtle">Rent</div>
                      <div className="font-medium text-navy">
                        {comp.rentMin === comp.rentMax
                          ? formatCurrency(comp.rentMin)
                          : `${formatCurrency(comp.rentMin)}–${formatCurrency(comp.rentMax)}`}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-ink-subtle">$/sq ft</div>
                      <div className="font-medium text-navy">{formatPsf(comp.psf)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-ink-subtle">Sq ft</div>
                      <div className="font-medium text-navy">
                        {comp.sqftMin === comp.sqftMax
                          ? comp.sqftMin
                          : `${comp.sqftMin}–${comp.sqftMax}`}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-ink-subtle">DOM</div>
                      <div className="font-medium text-navy">
                        {comp.daysOnMarket ?? "—"}
                      </div>
                    </div>
                  </div>
                  <p className="text-xs leading-relaxed text-ink-muted">{comp.notes}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Reviewed and excluded</CardTitle>
            <CardDescription>
              Candidates considered but not used in the pricing set
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {excludedComparables.map((ex) => (
              <div
                key={ex.id}
                className="rounded-lg border border-border bg-surface/50 px-4 py-3"
              >
                <div className="text-sm font-medium text-navy">{ex.name}</div>
                <p className="mt-1 text-sm text-ink-muted">{ex.reason}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
