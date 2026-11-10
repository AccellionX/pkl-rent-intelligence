"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FileText, Search } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { useDemoStore } from "@/store/demo-store";
import { formatCurrency } from "@/lib/utils";
import { VETERANS_BUILDING_ID } from "@/data/veterans";
import { useRouter } from "next/navigation";

export default function ReportsHistoryPage() {
  const router = useRouter();
  const reports = useDemoStore((s) => s.reports);
  const [query, setQuery] = useState("");
  const [buildingFilter, setBuildingFilter] = useState("all");

  const buildings = useMemo(() => {
    const map = new Map<string, string>();
    reports.forEach((r) => map.set(r.buildingId, r.buildingName));
    return Array.from(map.entries());
  }, [reports]);

  const grouped = useMemo(() => {
    let list = [...reports];
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          r.buildingName.toLowerCase().includes(q) ||
          r.unitLabels.some((u) => u.toLowerCase().includes(q)),
      );
    }
    if (buildingFilter !== "all") {
      list = list.filter((r) => r.buildingId === buildingFilter);
    }

    const byBuilding = new Map<string, typeof list>();
    list.forEach((r) => {
      const arr = byBuilding.get(r.buildingId) ?? [];
      arr.push(r);
      byBuilding.set(r.buildingId, arr);
    });
    return Array.from(byBuilding.entries()).map(([buildingId, items]) => ({
      buildingId,
      buildingName: items[0]?.buildingName ?? buildingId,
      items: items.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    }));
  }, [reports, query, buildingFilter]);

  return (
    <div>
      <Topbar
        title="Report History"
        subtitle="Organized by building and unit · stored in localStorage"
      />
      <div className="px-6 py-5">
        <Breadcrumbs
          items={[{ label: "Portfolio", href: "/" }, { label: "Report History" }]}
        />

        <div className="mb-5 flex flex-col gap-3 rounded-xl border border-border bg-white p-4 shadow-sm md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by building, unit, or title…"
              className="pl-9"
            />
          </div>
          <Select value={buildingFilter} onValueChange={setBuildingFilter}>
            <SelectTrigger className="w-full md:w-64">
              <SelectValue placeholder="Building" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All buildings</SelectItem>
              {buildings.map(([id, name]) => (
                <SelectItem key={id} value={id}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button asChild variant="gold">
            <Link href={`/buildings/${VETERANS_BUILDING_ID}/reports`}>Generate new</Link>
          </Button>
        </div>

        {grouped.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No reports match"
            description="Generate a branded PDF from the 30 Veterans workspace to populate history."
            actionLabel="Generate report"
            onAction={() => {
              router.push(`/buildings/${VETERANS_BUILDING_ID}/reports`);
            }}
          />
        ) : (
          <div className="space-y-6">
            {grouped.map((group) => (
              <section
                key={group.buildingId}
                className="overflow-hidden rounded-xl border border-border bg-white shadow-sm"
              >
                <div className="flex items-center justify-between border-b border-border bg-surface-muted/50 px-4 py-3">
                  <div>
                    <h2 className="font-semibold text-navy">{group.buildingName}</h2>
                    <p className="text-xs text-ink-muted">
                      {group.items.length} report{group.items.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/buildings/${group.buildingId}`}>Open property</Link>
                  </Button>
                </div>
                <div className="divide-y divide-border">
                  {group.items.map((r) => (
                    <div
                      key={r.id}
                      className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <div className="font-medium text-navy">{r.title}</div>
                        <div className="mt-1 text-sm text-ink-muted">
                          Units: {r.unitLabels.join(", ") || "—"} · Prepared by {r.preparedBy}
                        </div>
                        <div className="mt-1 text-xs text-ink-subtle">
                          {new Date(r.createdAt).toLocaleString()} · Rec{" "}
                          {formatCurrency(r.recommendedLow)}–
                          {formatCurrency(r.recommendedHigh)}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{r.status}</Badge>
                        <Button asChild size="sm" variant="ghost">
                          <Link href={`/buildings/${r.buildingId}/reports`}>
                            Re-generate
                          </Link>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
