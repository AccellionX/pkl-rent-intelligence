"use client";

import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  Building2,
  FileText,
  Home,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { OccupancyChart } from "@/components/charts/occupancy-chart";
import { portfolioStats, seedBuildings } from "@/data/portfolio-seed";
import { VETERANS_BUILDING_ID } from "@/data/veterans";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/utils";
import { useDemoStore } from "@/store/demo-store";

export default function PortfolioDashboardPage() {
  const reports = useDemoStore((s) => s.reports);
  const featured = seedBuildings.find((b) => b.id === VETERANS_BUILDING_ID)!;
  const topVacancy = [...seedBuildings]
    .sort((a, b) => b.vacancyCount - a.vacancyCount)
    .slice(0, 5);
  const recentBuildings = seedBuildings
    .filter((b) => b.id !== VETERANS_BUILDING_ID)
    .slice(0, 6);

  return (
    <div>
      <Topbar
        title="Portfolio Dashboard"
        subtitle="PKL Management LLC · New England multifamily portfolio"
      />
      <div className="mesh-hero px-6 pb-10 pt-5">
        <Breadcrumbs items={[{ label: "Portfolio" }]} />

        <section className="mb-6 overflow-hidden rounded-2xl border border-border/80 bg-navy text-white shadow-lg">
          <div className="grid gap-0 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="relative p-7 md:p-8">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(201,162,39,0.18),transparent_50%)]" />
              <div className="relative">
                <Badge variant="gold">Featured property</Badge>
                <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight md:text-4xl">
                  {featured.name}
                </h2>
                <p className="mt-2 max-w-xl text-sm text-white/70">
                  Marketed as “{featured.marketingName}”. Review nine comps, adjust asking
                  rents, and generate a branded pricing PDF — the core demo journey.
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <Button asChild variant="gold">
                    <Link href={`/buildings/${VETERANS_BUILDING_ID}`}>
                      Open property <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                  <Button asChild variant="secondary">
                    <Link href={`/buildings/${VETERANS_BUILDING_ID}/comparables`}>
                      Review comparables
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
            <div className="relative min-h-[220px]">
              <Image
                src={featured.imageUrl}
                alt={featured.name}
                fill
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 40vw"
                priority
              />
              <div className="absolute inset-0 bg-gradient-to-l from-transparent to-navy/40" />
            </div>
          </div>
        </section>

        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4 animate-fade-in-delay">
          <StatCard
            label="Buildings"
            value={formatNumber(portfolioStats.buildingCount)}
            hint="Illustrative sample portfolio"
            icon={Building2}
          />
          <StatCard
            label="Units"
            value={formatNumber(portfolioStats.unitCount)}
            hint={`${formatNumber(portfolioStats.vacantUnits)} currently vacant`}
            icon={Home}
          />
          <StatCard
            label="Occupancy"
            value={formatPercent(portfolioStats.occupancyRate * 100, 1)}
            hint={`Avg rent ${formatCurrency(portfolioStats.avgRent)}`}
            icon={TrendingUp}
            trend={{ label: "Stabilized across core assets", positive: true }}
          />
          <StatCard
            label="Monthly revenue"
            value={formatCurrency(portfolioStats.monthlyRevenue, { compact: true })}
            hint={`${formatNumber(reports.length)} reports in demo history`}
            icon={Wallet}
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2 animate-fade-in-delay">
            <CardHeader>
              <CardTitle>Continue the demo journey</CardTitle>
              <CardDescription>
                Portfolio → Property → Comparables → Pricing → PDF → History
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="grid gap-3 sm:grid-cols-2">
                {[
                  {
                    step: "01",
                    title: "Select property",
                    href: `/buildings/${VETERANS_BUILDING_ID}`,
                    desc: "Open 30 Veterans details & available units",
                  },
                  {
                    step: "02",
                    title: "Review comparables",
                    href: `/buildings/${VETERANS_BUILDING_ID}/comparables`,
                    desc: "Nine 1BR comps within 5 miles",
                  },
                  {
                    step: "03",
                    title: "Adjust pricing",
                    href: `/buildings/${VETERANS_BUILDING_ID}/pricing`,
                    desc: "Interactive rents with chart analysis",
                  },
                  {
                    step: "04",
                    title: "Generate PDF",
                    href: `/buildings/${VETERANS_BUILDING_ID}/reports`,
                    desc: "Download branded report & view history",
                  },
                ].map((item) => (
                  <Link
                    key={item.step}
                    href={item.href}
                    className="group rounded-xl border border-border bg-surface/60 p-4 transition-all hover:border-gold/40 hover:bg-white hover:shadow-sm"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold tracking-wider text-gold">
                        {item.step}
                      </span>
                      <ArrowRight className="h-4 w-4 text-ink-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-navy" />
                    </div>
                    <div className="mt-2 font-semibold text-navy">{item.title}</div>
                    <p className="mt-1 text-sm text-ink-muted">{item.desc}</p>
                  </Link>
                ))}
              </ol>
            </CardContent>
          </Card>

          <Card className="animate-fade-in-delay-2">
            <CardHeader>
              <CardTitle>Occupancy mix</CardTitle>
              <CardDescription>Sample portfolio units</CardDescription>
            </CardHeader>
            <CardContent>
              <OccupancyChart
                occupied={portfolioStats.occupiedUnits}
                vacant={portfolioStats.vacantUnits}
              />
              <div className="mt-2 flex justify-center gap-6 text-xs text-ink-muted">
                <span className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-navy" /> Occupied
                </span>
                <span className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-gold" /> Vacant
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle>Highest vacancy</CardTitle>
                <CardDescription>Prioritize leasing attention</CardDescription>
              </div>
              <Button asChild variant="ghost" size="sm">
                <Link href="/buildings">View all</Link>
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {topVacancy.map((b) => (
                  <Link
                    key={b.id}
                    href={`/buildings/${b.id}`}
                    className="flex items-center justify-between rounded-lg border border-transparent px-2 py-2 transition-colors hover:border-border hover:bg-surface-muted/60"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-navy">{b.name}</div>
                      <div className="text-xs text-ink-muted">
                        {b.city}, {b.state} · {b.unitCount} units
                      </div>
                    </div>
                    <Badge variant={b.vacancyCount > 3 ? "warning" : "secondary"}>
                      {b.vacancyCount} vacant
                    </Badge>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle>Recent reports</CardTitle>
                <CardDescription>Stored in browser localStorage</CardDescription>
              </div>
              <Button asChild variant="ghost" size="sm">
                <Link href="/reports">
                  <FileText className="h-4 w-4" /> History
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {reports.slice(0, 5).map((r) => (
                  <div
                    key={r.id}
                    className="flex items-start justify-between gap-3 rounded-lg border border-border/70 px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-navy">{r.title}</div>
                      <div className="text-xs text-ink-muted">
                        {r.buildingName} · {r.unitLabels.join(", ")}
                      </div>
                    </div>
                    <Badge variant="outline">{r.status}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="mt-6">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-display text-lg font-semibold text-navy">Portfolio snapshot</h3>
            <Button asChild variant="outline" size="sm">
              <Link href="/buildings">Browse buildings</Link>
            </Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {recentBuildings.map((b) => (
              <Link
                key={b.id}
                href={`/buildings/${b.id}`}
                className="group overflow-hidden rounded-xl border border-border bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="relative h-36">
                  <Image
                    src={b.imageUrl}
                    alt={b.name}
                    fill
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                    sizes="(max-width: 768px) 100vw, 33vw"
                  />
                </div>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-navy">{b.name}</div>
                      <div className="text-xs text-ink-muted">
                        {b.city}, {b.state}
                      </div>
                    </div>
                    <Badge variant="secondary">{b.portfolio}</Badge>
                  </div>
                  <div className="mt-3 flex gap-4 text-xs text-ink-muted">
                    <span>{b.unitCount} units</span>
                    <span>{formatCurrency(b.avgRent)} avg</span>
                    <span>{formatPercent(b.occupancyRate * 100, 0)} occ</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
