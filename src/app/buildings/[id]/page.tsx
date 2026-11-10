"use client";

import { use } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  Building2,
  ExternalLink,
  FileText,
  LineChart,
  MapPin,
  Upload,
} from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PropertyNav } from "@/components/buildings/property-nav";
import { getBuilding, getUnitsForBuilding, useDemoStore } from "@/store/demo-store";
import { VETERANS_BUILDING_ID } from "@/data/veterans";
import { formatCurrency, formatPercent, formatPsf } from "@/lib/utils";
import { useRouter } from "next/navigation";

export default function BuildingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const { id } = use(params);
  const building = getBuilding(id);
  const units = getUnitsForBuilding(id);
  const getUnitRent = useDemoStore((s) => s.getUnitRent);
  const available = units.filter((u) => u.status === "available");
  const isVeterans = id === VETERANS_BUILDING_ID;

  if (!building) {
    return (
      <div>
        <Topbar title="Property not found" />
        <div className="px-6 py-5">
          <EmptyState
            icon={Building2}
            title="Building not found"
            description="This property ID is not in the sample portfolio."
            actionLabel="Back to buildings"
            onAction={() => {
              router.push("/buildings");
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div>
      <Topbar
        title={building.name}
        subtitle={
          building.marketingName
            ? `Marketed as “${building.marketingName}”`
            : `${building.city}, ${building.state}`
        }
      />
      <div className="px-6 py-5">
        <Breadcrumbs
          items={[
            { label: "Portfolio", href: "/" },
            { label: "Buildings", href: "/buildings" },
            { label: building.name },
          ]}
        />
        <PropertyNav buildingId={id} />

        <div className="mb-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
            <div className="relative h-64 md:h-80">
              <Image
                src={building.imageUrl}
                alt={building.name}
                fill
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 60vw"
                priority
              />
              <div className="absolute inset-0 bg-gradient-to-t from-navy/70 via-transparent to-transparent" />
              <div className="absolute bottom-4 left-4 right-4 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <Badge variant="gold">Placeholder photography</Badge>
                  <div className="mt-2 flex items-center gap-2 text-sm text-white/90">
                    <MapPin className="h-4 w-4" />
                    {building.address}, {building.city}, {building.state} {building.zip}
                  </div>
                </div>
                {isVeterans && (
                  <Badge className="bg-white/15 text-white border-white/20">
                    Source report property
                  </Badge>
                )}
              </div>
            </div>
            <div className="grid gap-4 p-5 sm:grid-cols-4">
              {[
                ["Built", building.yearBuilt ?? "—"],
                ["Stories", building.stories ?? "—"],
                ["Units", building.unitCount],
                ["Occupancy", formatPercent(building.occupancyRate * 100, 0)],
              ].map(([label, value]) => (
                <div key={String(label)}>
                  <div className="text-xs uppercase tracking-wider text-ink-subtle">{label}</div>
                  <div className="mt-1 font-display text-xl font-semibold text-navy">{value}</div>
                </div>
              ))}
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Property workspace</CardTitle>
              <CardDescription>Navigate the pricing intelligence workflow</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {[
                {
                  href: `/buildings/${id}/comparables`,
                  label: "Comparables",
                  desc: "Side-by-side rental comps",
                  icon: LineChart,
                  enabled: isVeterans,
                },
                {
                  href: `/buildings/${id}/pricing`,
                  label: "Pricing analysis",
                  desc: "Adjust rents & recommendations",
                  icon: LineChart,
                  enabled: isVeterans,
                },
                {
                  href: `/buildings/${id}/leads`,
                  label: "Lead analytics",
                  desc: "Zillow & Apartments.com",
                  icon: ExternalLink,
                  enabled: isVeterans,
                },
                {
                  href: `/buildings/${id}/reports`,
                  label: "Generate PDF report",
                  desc: "Branded downloadable report",
                  icon: FileText,
                  enabled: isVeterans,
                },
                {
                  href: `/upload?buildingId=${id}`,
                  label: "Upload comps file",
                  desc: "PDF / Excel AI extraction (simulated)",
                  icon: Upload,
                  enabled: true,
                },
              ].map((item) => {
                const Icon = item.icon;
                if (!item.enabled) {
                  return (
                    <div
                      key={item.href}
                      className="flex items-center gap-3 rounded-lg border border-dashed border-border px-3 py-3 opacity-60"
                    >
                      <Icon className="h-4 w-4 text-ink-subtle" />
                      <div className="flex-1">
                        <div className="text-sm font-medium text-navy">{item.label}</div>
                        <div className="text-xs text-ink-muted">
                          Full workflow available on 30 Veterans demo property
                        </div>
                      </div>
                    </div>
                  );
                }
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="flex items-center gap-3 rounded-lg border border-border px-3 py-3 transition-all hover:border-gold/40 hover:bg-surface-muted/50"
                  >
                    <Icon className="h-4 w-4 text-gold" />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-navy">{item.label}</div>
                      <div className="text-xs text-ink-muted">{item.desc}</div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-ink-subtle" />
                  </Link>
                );
              })}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle>Units</CardTitle>
                <CardDescription>
                  {available.length} available · {units.length} total in building file
                </CardDescription>
              </div>
              {isVeterans && (
                <Button asChild size="sm" variant="gold">
                  <Link href={`/buildings/${id}/pricing`}>Adjust pricing</Link>
                </Button>
              )}
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="border-b border-border text-xs uppercase tracking-wider text-ink-subtle">
                    <tr>
                      <th className="pb-2 font-medium">Unit</th>
                      <th className="pb-2 font-medium">Beds/Baths</th>
                      <th className="pb-2 font-medium">Sq ft</th>
                      <th className="pb-2 font-medium">Asking</th>
                      <th className="pb-2 font-medium">$/sf</th>
                      <th className="pb-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(isVeterans ? available : units.slice(0, 12)).map((u) => {
                      const rent = getUnitRent(u.id, u.askingRent);
                      return (
                        <tr key={u.id} className="border-b border-border/60 last:border-0">
                          <td className="py-2.5 font-medium text-navy">{u.unitNumber}</td>
                          <td className="py-2.5">
                            {u.beds} / {u.baths}
                          </td>
                          <td className="py-2.5">{u.sqft}</td>
                          <td className="py-2.5">{formatCurrency(rent)}</td>
                          <td className="py-2.5">{formatPsf(rent / u.sqft)}</td>
                          <td className="py-2.5">
                            <Badge
                              variant={u.status === "available" ? "success" : "secondary"}
                            >
                              {u.status}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Amenities</CardTitle>
              <CardDescription>Building & unit features</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {building.amenities.map((a) => (
                  <Badge key={a} variant="outline">
                    {a}
                  </Badge>
                ))}
              </div>
              {building.listingUrls && (
                <div className="mt-5 space-y-2 border-t border-border pt-4">
                  <div className="text-xs font-medium uppercase tracking-wider text-ink-subtle">
                    Where it is listed
                  </div>
                  {building.listingUrls.zillow && (
                    <a
                      href={building.listingUrls.zillow}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2 text-sm text-navy hover:underline"
                    >
                      Zillow <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                  {building.listingUrls.apartments && (
                    <a
                      href={building.listingUrls.apartments}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2 text-sm text-navy hover:underline"
                    >
                      Apartments.com <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                  <p className="text-xs text-ink-muted">
                    External listing links open live sites. In-app metrics are sample/demo data.
                  </p>
                </div>
              )}
              <div className="mt-4 text-xs text-ink-muted">
                Manager: {building.manager}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
