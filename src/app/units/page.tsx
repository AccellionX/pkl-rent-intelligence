"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Home, Search } from "lucide-react";
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
import { seedBuildings, seedUnits } from "@/data/portfolio-seed";
import { formatCurrency, formatPsf } from "@/lib/utils";
import { useDemoStore } from "@/store/demo-store";

const buildingMap = Object.fromEntries(seedBuildings.map((b) => [b.id, b]));

export default function UnitsPage() {
  const getUnitRent = useDemoStore((s) => s.getUnitRent);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [beds, setBeds] = useState("all");

  const filtered = useMemo(() => {
    let list = [...seedUnits];
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((u) => {
        const b = buildingMap[u.buildingId];
        return (
          u.unitNumber.toLowerCase().includes(q) ||
          b?.name.toLowerCase().includes(q) ||
          b?.city.toLowerCase().includes(q)
        );
      });
    }
    if (status !== "all") list = list.filter((u) => u.status === status);
    if (beds !== "all") list = list.filter((u) => String(u.beds) === beds);
    return list.slice(0, 250);
  }, [query, status, beds]);

  return (
    <div>
      <Topbar title="Units" subtitle={`${seedUnits.length}+ units across the portfolio`} />
      <div className="px-6 py-5">
        <Breadcrumbs items={[{ label: "Portfolio", href: "/" }, { label: "Units" }]} />

        <div className="mb-5 flex flex-col gap-3 rounded-xl border border-border bg-white p-4 shadow-sm md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search unit # or building…"
              className="pl-9"
            />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-full md:w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="available">Available</SelectItem>
              <SelectItem value="leased">Leased</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="offline">Offline</SelectItem>
            </SelectContent>
          </Select>
          <Select value={beds} onValueChange={setBeds}>
            <SelectTrigger className="w-full md:w-36">
              <SelectValue placeholder="Beds" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All beds</SelectItem>
              <SelectItem value="0">Studio</SelectItem>
              <SelectItem value="1">1 bed</SelectItem>
              <SelectItem value="2">2 bed</SelectItem>
              <SelectItem value="3">3 bed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={Home}
            title="No units found"
            description="Adjust filters to see matching units in the sample portfolio."
            actionLabel="Reset filters"
            onAction={() => {
              setQuery("");
              setStatus("all");
              setBeds("all");
            }}
          />
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm table-row-hover">
                <thead className="border-b border-border bg-surface-muted/70 text-xs uppercase tracking-wider text-ink-subtle">
                  <tr>
                    <th className="px-4 py-3 font-medium">Unit</th>
                    <th className="px-4 py-3 font-medium">Building</th>
                    <th className="px-4 py-3 font-medium">Beds / baths</th>
                    <th className="px-4 py-3 font-medium">Sq ft</th>
                    <th className="px-4 py-3 font-medium">Asking</th>
                    <th className="px-4 py-3 font-medium">$/sf</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((u) => {
                    const building = buildingMap[u.buildingId];
                    const rent = getUnitRent(u.id, u.askingRent);
                    const statusVariant =
                      u.status === "available"
                        ? "success"
                        : u.status === "pending"
                          ? "warning"
                          : u.status === "offline"
                            ? "danger"
                            : "secondary";
                    return (
                      <tr key={u.id} className="border-b border-border/70 last:border-0">
                        <td className="px-4 py-3 font-medium text-navy">{u.unitNumber}</td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-navy">{building?.name}</div>
                          <div className="text-xs text-ink-muted">
                            {building?.city}, {building?.state}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {u.beds} / {u.baths}
                        </td>
                        <td className="px-4 py-3">{u.sqft}</td>
                        <td className="px-4 py-3">{formatCurrency(rent)}</td>
                        <td className="px-4 py-3">{formatPsf(rent / u.sqft)}</td>
                        <td className="px-4 py-3">
                          <Badge variant={statusVariant}>{u.status}</Badge>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button asChild size="sm" variant="ghost">
                            <Link href={`/buildings/${u.buildingId}`}>Building</Link>
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="border-t border-border px-4 py-3 text-xs text-ink-muted">
              Showing {filtered.length} units (capped for performance) · Edits persist via localStorage
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
