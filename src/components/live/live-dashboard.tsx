"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Building2,
  FileText,
  Upload,
  ClipboardList,
} from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LiveAuthGate } from "@/components/live/live-auth-gate";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { labelReportStatus } from "@/lib/ui/status-labels";
import { apiErrorMessage, toUserFacingError } from "@/lib/ui/user-facing-error";
import { formatNumber } from "@/lib/utils";

type DashboardData = {
  counts: {
    properties: number;
    unitTypes: number;
    reports: number;
    sourceDocuments: number;
    draftReports: number;
    awaitingReview: number;
    finalizedReports: number;
    savedToDrive: number;
  };
  recentReports: Array<{
    id: string;
    title: string;
    status: string;
    propertyId: string;
    propertyName: string;
    periodStart: string;
    periodEnd: string;
    updatedAt: string;
  }>;
};

function statusBadge(status: string) {
  if (status === "waiting_on_review") return <Badge variant="warning">{labelReportStatus(status)}</Badge>;
  if (status === "sent") return <Badge variant="success">{labelReportStatus(status)}</Badge>;
  if (status === "saved_to_drive") return <Badge variant="info">{labelReportStatus(status)}</Badge>;
  return <Badge variant="outline">{labelReportStatus(status)}</Badge>;
}

export function LiveDashboard() {
  return (
    <LiveAuthGate title="Sign in to view your dashboard">
      {(ctx) => <LiveDashboardInner organizationId={ctx.organizationId!} email={ctx.email} />}
    </LiveAuthGate>
  );
}

function LiveDashboardInner({
  organizationId,
  email,
}: {
  organizationId: string;
  email: string | null;
}) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/dashboard?organizationId=${organizationId}`)
      .then((r) => r.json().then((json) => ({ ok: r.ok, json })))
      .then((res) => {
        if (cancelled) return;
        if (!res.ok || !res.json.ok) {
          throw new Error(apiErrorMessage(res.json, "Could not load dashboard"));
        }
        setData(res.json.data as DashboardData);
        setError(null);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setData(null);
        setError(toUserFacingError(err, "Could not load dashboard"));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  return (
    <div>
      <Topbar
        title="Dashboard"
        subtitle={email ? email : "Organization dashboard"}
      />
      <div className="mesh-hero px-6 pb-10 pt-5">
        <Breadcrumbs items={[{ label: "Dashboard" }]} />

        <section className="mb-6 overflow-hidden rounded-2xl border border-border/80 bg-navy text-white shadow-lg">
          <div className="relative p-7 md:p-8">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(201,162,39,0.18),transparent_50%)]" />
            <div className="relative">
              <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight md:text-4xl">
                Rent Intelligence
              </h2>
              <p className="mt-2 max-w-xl text-sm text-white/70">
                Upload sources, review comps, approve pricing narrative, and generate branded
                PDFs for your organization.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <Button asChild variant="gold">
                  <Link href="/buildings">
                    Open properties <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild variant="secondary">
                  <Link href="/upload">Upload sources</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>

        {loading ? (
          <PageSkeleton rows={4} />
        ) : error ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base text-rose-800">Could not load dashboard</CardTitle>
              <CardDescription>{error}</CardDescription>
            </CardHeader>
          </Card>
        ) : data ? (
          <>
            <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Properties"
                value={formatNumber(data.counts.properties)}
                hint="Organization-scoped"
                icon={Building2}
              />
              <StatCard
                label="Unit types"
                value={formatNumber(data.counts.unitTypes)}
                hint="Across properties"
                icon={ClipboardList}
              />
              <StatCard
                label="Draft reports"
                value={formatNumber(data.counts.draftReports)}
                hint={`${formatNumber(data.counts.awaitingReview)} awaiting review`}
                icon={FileText}
              />
              <StatCard
                label="Source documents"
                value={formatNumber(data.counts.sourceDocuments)}
                hint={`${formatNumber(data.counts.finalizedReports)} finalized · Drive ${formatNumber(data.counts.savedToDrive)}`}
                icon={Upload}
              />
            </div>

            <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
              <Card>
                <CardHeader>
                  <CardTitle>Latest reporting activity</CardTitle>
                  <CardDescription>Recent report runs for this organization</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {data.recentReports.length === 0 ? (
                    <p className="text-sm text-ink-muted">
                      No reports yet. Create a property, upload sources, then open Pricing &amp;
                      Reports.
                    </p>
                  ) : (
                    data.recentReports.map((r) => (
                      <div
                        key={r.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 px-3 py-2"
                      >
                        <div>
                          <div className="text-sm font-medium text-navy">{r.title}</div>
                          <div className="text-xs text-ink-muted">
                            {r.propertyName} · {r.periodStart} → {r.periodEnd}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {statusBadge(r.status)}
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/buildings/${r.propertyId}/pricing`}>Open</Link>
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Suggested workflow</CardTitle>
                  <CardDescription>Typical path from property to report</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <Link className="block rounded-md border border-border px-3 py-2 hover:bg-surface-muted" href="/buildings">
                    1. Properties / buildings
                  </Link>
                  <Link className="block rounded-md border border-border px-3 py-2 hover:bg-surface-muted" href="/upload">
                    2. Data uploads
                  </Link>
                  <Link className="block rounded-md border border-border px-3 py-2 hover:bg-surface-muted" href="/buildings">
                    3. Comparables review (per property)
                  </Link>
                  <Link className="block rounded-md border border-border px-3 py-2 hover:bg-surface-muted" href="/reports">
                    4. Report history
                  </Link>
                </CardContent>
              </Card>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
