"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText, Search } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LiveAuthGate } from "@/components/live/live-auth-gate";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { apiErrorMessage, toUserFacingError } from "@/lib/ui/user-facing-error";

type ReportRow = {
  id: string;
  title: string;
  status: string;
  propertyId: string;
  propertyName: string;
  unitTypeLabel: string | null;
  periodStart: string;
  periodEnd: string;
  updatedAt: string;
  sentAt: string | null;
  savedToDriveAt?: string | null;
  driveWebViewLink?: string | null;
  driveBackupError?: string | null;
};

function statusBadge(status: string) {
  if (status === "waiting_on_review") return <Badge variant="warning">Ready for review</Badge>;
  if (status === "sent") return <Badge variant="success">Completed</Badge>;
  if (status === "saved_to_drive") return <Badge variant="info">Saved to Google Drive</Badge>;
  return <Badge variant="outline">In progress</Badge>;
}

export function LiveReportsHistory() {
  return (
    <LiveAuthGate title="Sign in to view report history">
      {(ctx) => <Inner organizationId={ctx.organizationId!} />}
    </LiveAuthGate>
  );
}

function Inner({ organizationId }: { organizationId: string }) {
  const router = useRouter();
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/reports?organizationId=${organizationId}`)
      .then((r) => r.json().then((json) => ({ ok: r.ok, json })))
      .then((res) => {
        if (cancelled) return;
        if (!res.ok || !res.json.ok) {
          throw new Error(apiErrorMessage(res.json, "Could not load report history"));
        }
        setReports(res.json.data.reports ?? []);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) {
          setReports([]);
          setError(toUserFacingError(err, "Could not load report history"));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return reports;
    return reports.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        r.propertyName.toLowerCase().includes(q) ||
        (r.unitTypeLabel?.toLowerCase().includes(q) ?? false),
    );
  }, [reports, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, ReportRow[]>();
    for (const r of filtered) {
      const arr = map.get(r.propertyId) ?? [];
      arr.push(r);
      map.set(r.propertyId, arr);
    }
    return Array.from(map.entries()).map(([propertyId, items]) => ({
      propertyId,
      propertyName: items[0]?.propertyName ?? propertyId,
      items,
    }));
  }, [filtered]);

  return (
    <div>
      <Topbar
        title="Report History"
        subtitle="Completed reports and Google Drive backup status"
      />
      <div className="px-6 py-5">
        <Breadcrumbs
          items={[{ label: "Dashboard", href: "/" }, { label: "Report History" }]}
        />

        <div className="mb-5 flex flex-col gap-3 rounded-xl border border-border bg-white p-4 shadow-sm md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by title, property, or unit type…"
              className="pl-9"
            />
          </div>
        </div>

        {loading ? (
          <PageSkeleton rows={3} />
        ) : error ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base text-rose-800">Could not load history</CardTitle>
              <CardDescription>{error}</CardDescription>
            </CardHeader>
          </Card>
        ) : grouped.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No report runs yet"
            description="Create a report from a property’s Pricing or PDF workspace after uploading sources."
            actionLabel="Go to properties"
            onAction={() => router.push("/buildings")}
          />
        ) : (
          <div className="space-y-5">
            {grouped.map((g) => (
              <Card key={g.propertyId}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{g.propertyName}</CardTitle>
                  <CardDescription>{g.items.length} report run(s)</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {g.items.map((r) => (
                    <div
                      key={r.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 px-3 py-2"
                    >
                      <div>
                        <div className="text-sm font-medium text-navy">{r.title}</div>
                        <div className="text-xs text-ink-muted">
                          {r.unitTypeLabel ?? "Unit type"} · {r.periodStart} → {r.periodEnd}
                          {r.sentAt
                            ? ` · finalized ${new Date(r.sentAt).toLocaleDateString()}`
                            : ""}
                          {r.savedToDriveAt
                            ? ` · Drive ${new Date(r.savedToDriveAt).toLocaleDateString()}`
                            : ""}
                        </div>
                        {r.driveBackupError ? (
                          <div className="text-xs text-rose-800">{r.driveBackupError}</div>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2">
                        {statusBadge(r.status)}
                        {r.driveWebViewLink ? (
                          <Button asChild size="sm" variant="outline">
                            <a href={r.driveWebViewLink} target="_blank" rel="noreferrer">
                              Open in Drive
                            </a>
                          </Button>
                        ) : null}
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/buildings/${r.propertyId}/reports`}>PDF</Link>
                        </Button>
                        <Button asChild size="sm" variant="ghost">
                          <Link href={`/buildings/${r.propertyId}/pricing`}>Pricing</Link>
                        </Button>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
