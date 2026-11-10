"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { Building2, Search } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { seedBuildings } from "@/data/portfolio-seed";
import { formatCurrency, formatPercent } from "@/lib/utils";
import { Suspense } from "react";

function BuildingsContent() {
  const searchParams = useSearchParams();
  const initialQ = searchParams.get("q") ?? "";
  const [query, setQuery] = useState(initialQ);
  const [stateFilter, setStateFilter] = useState("all");
  const [portfolioFilter, setPortfolioFilter] = useState("all");
  const [sort, setSort] = useState("name");

  const filtered = useMemo(() => {
    let list = [...seedBuildings];
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (b) =>
          b.name.toLowerCase().includes(q) ||
          b.address.toLowerCase().includes(q) ||
          b.city.toLowerCase().includes(q) ||
          (b.marketingName?.toLowerCase().includes(q) ?? false),
      );
    }
    if (stateFilter !== "all") list = list.filter((b) => b.state === stateFilter);
    if (portfolioFilter !== "all")
      list = list.filter((b) => b.portfolio === portfolioFilter);

    list.sort((a, b) => {
      if (sort === "vacancy") return b.vacancyCount - a.vacancyCount;
      if (sort === "rent") return b.avgRent - a.avgRent;
      if (sort === "units") return b.unitCount - a.unitCount;
      if (a.isFeatured) return -1;
      if (b.isFeatured) return 1;
      return a.name.localeCompare(b.name);
    });
    return list;
  }, [query, stateFilter, portfolioFilter, sort]);

  return (
    <div>
      <Topbar title="Buildings" subtitle={`${seedBuildings.length} properties in sample portfolio`} />
      <div className="px-6 py-5">
        <Breadcrumbs items={[{ label: "Portfolio", href: "/" }, { label: "Buildings" }]} />

        <div className="mb-5 flex flex-col gap-3 rounded-xl border border-border bg-white p-4 shadow-sm lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, address, or city…"
              className="pl-9"
            />
          </div>
          <Select value={stateFilter} onValueChange={setStateFilter}>
            <SelectTrigger className="w-full lg:w-36">
              <SelectValue placeholder="State" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All states</SelectItem>
              <SelectItem value="RI">Rhode Island</SelectItem>
              <SelectItem value="MA">Massachusetts</SelectItem>
              <SelectItem value="CT">Connecticut</SelectItem>
            </SelectContent>
          </Select>
          <Select value={portfolioFilter} onValueChange={setPortfolioFilter}>
            <SelectTrigger className="w-full lg:w-40">
              <SelectValue placeholder="Portfolio" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All strategies</SelectItem>
              <SelectItem value="core">Core</SelectItem>
              <SelectItem value="value-add">Value-add</SelectItem>
              <SelectItem value="lease-up">Lease-up</SelectItem>
              <SelectItem value="stabilized">Stabilized</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger className="w-full lg:w-40">
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name">Name</SelectItem>
              <SelectItem value="vacancy">Vacancy</SelectItem>
              <SelectItem value="rent">Avg rent</SelectItem>
              <SelectItem value="units">Unit count</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="No buildings match"
            description="Try clearing filters or searching a different city."
            actionLabel="Clear search"
            onAction={() => {
              setQuery("");
              setStateFilter("all");
              setPortfolioFilter("all");
            }}
          />
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[880px] text-left text-sm table-row-hover">
                <thead className="border-b border-border bg-surface-muted/70 text-xs uppercase tracking-wider text-ink-subtle">
                  <tr>
                    <th className="px-4 py-3 font-medium">Property</th>
                    <th className="px-4 py-3 font-medium">Location</th>
                    <th className="px-4 py-3 font-medium">Units</th>
                    <th className="px-4 py-3 font-medium">Vacant</th>
                    <th className="px-4 py-3 font-medium">Occupancy</th>
                    <th className="px-4 py-3 font-medium">Avg rent</th>
                    <th className="px-4 py-3 font-medium">Strategy</th>
                    <th className="px-4 py-3 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((b) => (
                    <tr key={b.id} className="border-b border-border/70 last:border-0">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="relative h-10 w-14 overflow-hidden rounded-md">
                            <Image
                              src={b.imageUrl}
                              alt=""
                              fill
                              className="object-cover"
                              sizes="56px"
                            />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-navy">{b.name}</span>
                              {b.isFeatured && <Badge variant="gold">Featured</Badge>}
                            </div>
                            <div className="text-xs text-ink-muted">{b.address}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-ink-muted">
                        {b.city}, {b.state}
                      </td>
                      <td className="px-4 py-3">{b.unitCount}</td>
                      <td className="px-4 py-3">{b.vacancyCount}</td>
                      <td className="px-4 py-3">{formatPercent(b.occupancyRate * 100, 0)}</td>
                      <td className="px-4 py-3">{formatCurrency(b.avgRent)}</td>
                      <td className="px-4 py-3">
                        <Badge variant="secondary">{b.portfolio}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/buildings/${b.id}`}>Open</Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t border-border px-4 py-3 text-xs text-ink-muted">
              Showing {filtered.length} of {seedBuildings.length} buildings · Sample data
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function BuildingsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-ink-muted">Loading buildings…</div>}>
      <BuildingsContent />
    </Suspense>
  );
}
