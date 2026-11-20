"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Building2, Eye, Mail, MousePointerClick, Phone } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { GuidedReportChrome } from "@/components/buildings/guided-report-chrome";
import { GuidedStepNav } from "@/components/buildings/guided-step-nav";
import { hrefForReportStep } from "@/lib/reports/guided-workflow";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard } from "@/components/ui/stat-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LeadsTrendChart } from "@/components/charts/leads-trend-chart";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { apiErrorMessage, toUserFacingError } from "@/lib/ui/user-facing-error";
import { formatNullableMetric } from "@/lib/weekly/agent-notes";
import { formatNumber, formatPercent } from "@/lib/utils";

type WeekRow = {
  id: string;
  weekStart: string;
  weekEnd: string;
  zillow: {
    metrics: Record<string, number | null>;
    listingToDate: Record<string, number | null>;
  };
  apartments: {
    metrics: {
      totalLeads: number | null;
      phoneCalls: number | null;
      emails: number | null;
      tours: number | null;
      applications: number | null;
    };
    events: Array<{
      category: string;
      datetime: string | null;
      duration: string | null;
      commentSummary: string | null;
    }>;
  };
  agent: {
    toursScheduled: number | null;
    toursCompleted: number | null;
    applicationsReceived: number | null;
    weeklyComments: string | null;
    prospectFeedbackSummary: string | null;
    actionsPlannedNextWeek: string | null;
    provided: boolean;
  };
  derived: {
    zillowConversionWeek: number | null;
    zillowConversionToDate: number | null;
    zillowWow: Record<string, { absolute: number | null; percent: number | null }>;
  };
};

function fmtRatio(n: number | null): string {
  if (n == null) return "—";
  return formatPercent(n * 100);
}

function agentToForm(agent: WeekRow["agent"]) {
  return {
    toursScheduled: agent.toursScheduled == null ? "" : String(agent.toursScheduled),
    toursCompleted: agent.toursCompleted == null ? "" : String(agent.toursCompleted),
    applicationsReceived:
      agent.applicationsReceived == null ? "" : String(agent.applicationsReceived),
    weeklyComments: agent.weeklyComments ?? "",
    prospectFeedbackSummary: agent.prospectFeedbackSummary ?? "",
    actionsPlannedNextWeek: agent.actionsPlannedNextWeek ?? "",
  };
}

export function LiveWeeklyLeads({ propertyId }: { propertyId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reportId = searchParams.get("reportId");
  const unitTypeId = searchParams.get("unitTypeId");
  const uploadHref = hrefForReportStep({
    propertyId,
    stepId: "upload",
    reportRunId: reportId,
    unitTypeId,
  });
  const generalUploadHref = `/upload?buildingId=${propertyId}`;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [propertyName, setPropertyName] = useState<string>("Property");
  const [weeks, setWeeks] = useState<WeekRow[]>([]);
  const [selectedWeekStart, setSelectedWeekStart] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [form, setForm] = useState({
    toursScheduled: "",
    toursCompleted: "",
    applicationsReceived: "",
    weeklyComments: "",
    prospectFeedbackSummary: "",
    actionsPlannedNextWeek: "",
  });
  const selectedWeekRef = useRef<string | null>(null);

  const applyWeeklyPayload = useCallback(
    (propJson: { data?: { property?: { name?: string; marketing_name?: string | null } } }, weekJson: { data?: { weeks?: WeekRow[] } }) => {
      const property = propJson.data?.property;
      setPropertyName(property?.name ?? property?.marketing_name ?? "Property");
      const list = (weekJson.data?.weeks ?? []) as WeekRow[];
      setWeeks(list);
      const latest = list.length ? list[list.length - 1]! : null;
      const prev = selectedWeekRef.current;
      const nextWeek =
        prev && list.some((w) => w.weekStart === prev)
          ? prev
          : (latest?.weekStart ?? null);
      setSelectedWeekStart(nextWeek);
      selectedWeekRef.current = nextWeek;
      const row = nextWeek ? list.find((w) => w.weekStart === nextWeek) : null;
      if (row) setForm(agentToForm(row.agent));
    },
    [],
  );

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    return Promise.all([
      fetch(`/api/properties/${propertyId}`).then((r) => r.json().then((json) => ({ ok: r.ok, json }))),
      fetch(`/api/properties/${propertyId}/weekly-metrics`).then((r) =>
        r.json().then((json) => ({ ok: r.ok, json })),
      ),
    ])
      .then(([propRes, weekRes]) => {
        if (!propRes.ok) {
          throw new Error(apiErrorMessage(propRes.json, "Could not load property"));
        }
        if (!weekRes.ok) {
          throw new Error(apiErrorMessage(weekRes.json, "Could not load weekly metrics"));
        }
        applyWeeklyPayload(propRes.json, weekRes.json);
      })
      .catch((e) => {
        setError(toUserFacingError(e, "Could not load weekly metrics"));
      })
      .finally(() => {
        setLoading(false);
      });
  }, [propertyId, applyWeeklyPayload]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch(`/api/properties/${propertyId}`).then((r) => r.json().then((json) => ({ ok: r.ok, json }))),
      fetch(`/api/properties/${propertyId}/weekly-metrics`).then((r) =>
        r.json().then((json) => ({ ok: r.ok, json })),
      ),
    ])
      .then(([propRes, weekRes]) => {
        if (cancelled) return;
        if (!propRes.ok) {
          throw new Error(apiErrorMessage(propRes.json, "Could not load property"));
        }
        if (!weekRes.ok) {
          throw new Error(apiErrorMessage(weekRes.json, "Could not load weekly metrics"));
        }
        applyWeeklyPayload(propRes.json, weekRes.json);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(toUserFacingError(e, "Could not load weekly metrics"));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [propertyId, applyWeeklyPayload]);

  const selected = useMemo(
    () => weeks.find((w) => w.weekStart === selectedWeekStart) ?? null,
    [weeks, selectedWeekStart],
  );

  const chartData = useMemo(
    () =>
      weeks.map((w) => ({
        week: w.weekStart.slice(5),
        zillow: w.zillow.metrics.totalLeads ?? 0,
        apartments: w.apartments.metrics.totalLeads ?? 0,
      })),
    [weeks],
  );

  async function saveAgent() {
    if (!selected || saving) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const parseOptionalInt = (raw: string): number | null => {
        const t = raw.trim();
        if (!t) return null;
        const n = Number(t);
        if (!Number.isFinite(n) || n < 0) throw new Error("Counts must be non-negative numbers");
        return Math.trunc(n);
      };
      const res = await fetch(`/api/properties/${propertyId}/weekly-metrics`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weekStart: selected.weekStart,
          weekEnd: selected.weekEnd,
          toursScheduled: parseOptionalInt(form.toursScheduled),
          toursCompleted: parseOptionalInt(form.toursCompleted),
          applicationsReceived: parseOptionalInt(form.applicationsReceived),
          weeklyComments: form.weeklyComments.trim() || null,
          prospectFeedbackSummary: form.prospectFeedbackSummary.trim() || null,
          actionsPlannedNextWeek: form.actionsPlannedNextWeek.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(apiErrorMessage(json, "Could not save agent notes"));
      setSaveMsg("Saved — earlier weeks unchanged; platform exports preserved");
      await load();
    } catch (e) {
      setSaveMsg(toUserFacingError(e, "Could not save agent notes"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div>
        <Topbar title="Lead Analytics" subtitle={propertyName} />
        <PageSkeleton rows={4} />
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <Topbar title="Lead Analytics" />
        <div className="px-6 py-5">
          <EmptyState
            icon={Building2}
            title="Could not load weekly metrics"
            description={error}
            actionLabel="Retry"
            onAction={() => void load()}
          />
        </div>
      </div>
    );
  }

  if (!weeks.length) {
    return (
      <div>
        <Topbar title="Lead Analytics" subtitle={propertyName} />
        <div className="px-6 py-5">
          <Breadcrumbs
            items={[
              { label: "Portfolio", href: "/" },
              { label: "Buildings", href: "/buildings" },
              { label: propertyName, href: `/buildings/${propertyId}` },
              { label: "Leads" },
            ]}
          />
          <GuidedReportChrome propertyId={propertyId} defaultStep="weekly" />
          {reportId ? (
            <GuidedStepNav
              propertyId={propertyId}
              reportRunId={reportId}
              unitTypeId={unitTypeId}
              activeStep="weekly"
              continueLabel="Continue to pricing"
              continueHint="You can continue without weekly figures. They can be added later."
            />
          ) : null}
          <EmptyState
            icon={Building2}
            title="No weekly metrics yet"
            description="Upload Zillow Listing Performance and Apartments.com Excel files for this property from the Upload page."
            actionLabel="Go to Upload"
            onAction={() => {
              router.push(reportId ? uploadHref : generalUploadHref);
            }}
          />
        </div>
      </div>
    );
  }

  const z = selected?.zillow.metrics;
  const ltd = selected?.zillow.listingToDate;
  const a = selected?.apartments.metrics;
  const wowLeads = selected?.derived.zillowWow.totalLeads;

  return (
    <div>
      <Topbar
        title="Lead Analytics"
        subtitle={
          selected
            ? `Week ${selected.weekStart} → ${selected.weekEnd} · property-wide`
            : propertyName
        }
      />
      <div className="px-6 py-5">
        <Breadcrumbs
          items={[
            { label: "Portfolio", href: "/" },
            { label: "Buildings", href: "/buildings" },
            { label: propertyName, href: `/buildings/${propertyId}` },
            { label: "Leads" },
          ]}
        />
        <GuidedReportChrome propertyId={propertyId} defaultStep="weekly" />

        {reportId ? (
          <GuidedStepNav
            propertyId={propertyId}
            reportRunId={reportId}
            unitTypeId={unitTypeId}
            activeStep="weekly"
            continueLabel="Continue to pricing"
          />
        ) : null}

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Badge variant="gold">Weekly metrics</Badge>
          <Badge variant="outline">Weekly ≠ listing-to-date</Badge>
          <Badge variant="outline">No prospect PII</Badge>
        </div>

        <div className="mb-5 flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="week">Reporting week</Label>
            <select
              id="week"
              className="h-10 rounded-md border border-border bg-white px-3 text-sm"
              value={selectedWeekStart ?? ""}
              onChange={(e) => {
                const next = e.target.value;
                setSelectedWeekStart(next);
                selectedWeekRef.current = next;
                const row = weeks.find((w) => w.weekStart === next);
                if (row) setForm(agentToForm(row.agent));
                setSaveMsg(null);
              }}
            >
              {weeks.map((w) => (
                <option key={w.weekStart} value={w.weekStart}>
                  {w.weekStart} → {w.weekEnd}
                </option>
              ))}
            </select>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href={reportId ? uploadHref : generalUploadHref}>
              Upload weekly exports
            </Link>
          </Button>
        </div>

        {selected ? (
          <>
            <p className="mb-5 max-w-3xl text-sm text-ink-muted">
              Zillow conversion this week{" "}
              <span className="font-medium text-navy">
                {fmtRatio(selected.derived.zillowConversionWeek)}
              </span>
              {" · "}
              listing-to-date{" "}
              <span className="font-medium text-navy">
                {fmtRatio(selected.derived.zillowConversionToDate)}
              </span>
              {wowLeads?.absolute != null ? (
                <>
                  {" · "}WoW leads{" "}
                  <span className="font-medium text-navy">
                    {wowLeads.absolute > 0 ? "+" : ""}
                    {wowLeads.absolute}
                  </span>
                </>
              ) : null}
              . Platform metrics are property-wide (not unit-type splits).
            </p>

            <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Zillow leads (week)"
                value={formatNullableMetric(z?.totalLeads ?? null)}
                hint={`${formatNullableMetric(ltd?.totalLeads ?? null, formatNumber)} to date`}
                icon={MousePointerClick}
              />
              <StatCard
                label="Zillow views (week)"
                value={formatNullableMetric(z?.listingViews ?? null, formatNumber)}
                hint={`${formatNullableMetric(z?.impressions ?? null, formatNumber)} impressions`}
                icon={Eye}
              />
              <StatCard
                label="Apts.com phone"
                value={formatNullableMetric(a?.phoneCalls ?? null)}
                hint={`${formatNullableMetric(a?.emails ?? null)} emails · tours ${formatNullableMetric(a?.tours ?? null)}`}
                icon={Phone}
              />
              <StatCard
                label="Tours scheduled"
                value={formatNullableMetric(selected.agent.toursScheduled)}
                hint={`${formatNullableMetric(selected.agent.toursCompleted)} completed · ${formatNullableMetric(selected.agent.applicationsReceived)} apps`}
                icon={Mail}
              />
            </div>

            <div className="mb-6 grid gap-6 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>Lead trend</CardTitle>
                  <CardDescription>
                    Persisted weekly totals from Zillow and Apartments.com (null weeks chart as 0
                    for continuity only; tables keep —)
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <LeadsTrendChart data={chartData} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Agent weekly input</CardTitle>
                  <CardDescription>Editable per week · export re-uploads do not overwrite</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Label>Tours sched.</Label>
                      <Input
                        value={form.toursScheduled}
                        placeholder="—"
                        onChange={(e) => setForm((f) => ({ ...f, toursScheduled: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label>Completed</Label>
                      <Input
                        value={form.toursCompleted}
                        placeholder="—"
                        onChange={(e) => setForm((f) => ({ ...f, toursCompleted: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label>Apps</Label>
                      <Input
                        value={form.applicationsReceived}
                        placeholder="—"
                        onChange={(e) =>
                          setForm((f) => ({ ...f, applicationsReceived: e.target.value }))
                        }
                      />
                    </div>
                  </div>
                  <div>
                    <Label>Weekly comments</Label>
                    <Textarea
                      value={form.weeklyComments}
                      onChange={(e) => setForm((f) => ({ ...f, weeklyComments: e.target.value }))}
                      rows={2}
                    />
                  </div>
                  <div>
                    <Label>Prospect feedback summary</Label>
                    <Textarea
                      value={form.prospectFeedbackSummary}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, prospectFeedbackSummary: e.target.value }))
                      }
                      rows={2}
                      placeholder="No names, phones, or emails"
                    />
                  </div>
                  <div>
                    <Label>Actions next week</Label>
                    <Textarea
                      value={form.actionsPlannedNextWeek}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, actionsPlannedNextWeek: e.target.value }))
                      }
                      rows={2}
                    />
                  </div>
                  <Button onClick={() => void saveAgent()} pending={saving} className="w-full">
                    Save agent notes
                  </Button>
                  {saveMsg ? <p className="text-xs text-ink-muted">{saveMsg}</p> : null}
                </CardContent>
              </Card>
            </div>

            <Tabs defaultValue="zillow">
              <TabsList>
                <TabsTrigger value="zillow">Zillow Rental Manager</TabsTrigger>
                <TabsTrigger value="apartments">Apartments.com</TabsTrigger>
              </TabsList>
              <TabsContent value="zillow">
                <Card>
                  <CardHeader>
                    <CardTitle>Zillow metrics</CardTitle>
                    <CardDescription>This week vs listing to date (cumulative Sheet1)</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[520px] text-left text-sm">
                        <thead className="border-b border-border text-xs uppercase tracking-wider text-ink-subtle">
                          <tr>
                            <th className="pb-2 font-medium">Metric</th>
                            <th className="pb-2 font-medium">This week</th>
                            <th className="pb-2 font-medium">Listing to date</th>
                            <th className="pb-2 font-medium">WoW Δ</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(
                            [
                              ["Impressions", "impressions"],
                              ["Listing views", "listingViews"],
                              ["Web referrals", "listingWebReferrals"],
                              ["Total leads", "totalLeads"],
                              ["Phone leads", "phoneLeads"],
                              ["Email leads", "emailLeads"],
                              ["Ad impressions", "adImpressions"],
                              ["Ad clicks", "adClicks"],
                            ] as const
                          ).map(([label, key]) => (
                            <tr key={key} className="border-b border-border/60 last:border-0">
                              <td className="py-2.5 font-medium text-navy">{label}</td>
                              <td className="py-2.5">
                                {formatNullableMetric(z?.[key] ?? null, formatNumber)}
                              </td>
                              <td className="py-2.5">
                                {formatNullableMetric(ltd?.[key] ?? null, formatNumber)}
                              </td>
                              <td className="py-2.5">
                                {formatNullableMetric(
                                  selected.derived.zillowWow[key]?.absolute ?? null,
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="apartments">
                <div className="grid gap-6 lg:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle>Lead summary</CardTitle>
                      <CardDescription>Missing platform values show as unavailable</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <div className="flex justify-between border-b border-border pb-2">
                        <span className="text-ink-muted">Phone calls</span>
                        <span className="font-semibold">
                          {formatNullableMetric(a?.phoneCalls ?? null)}
                        </span>
                      </div>
                      <div className="flex justify-between border-b border-border pb-2">
                        <span className="text-ink-muted">Emails</span>
                        <span className="font-semibold">
                          {formatNullableMetric(a?.emails ?? null)}
                        </span>
                      </div>
                      <div className="flex justify-between border-b border-border pb-2">
                        <span className="text-ink-muted">Tours (export)</span>
                        <span className="font-semibold">
                          {formatNullableMetric(a?.tours ?? null)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-ink-muted">Applications (export)</span>
                        <span className="font-semibold">
                          {formatNullableMetric(a?.applications ?? null)}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardTitle>Sanitized activity</CardTitle>
                      <CardDescription>No renter names, phones, or emails</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {selected.apartments.events.length === 0 ? (
                        <p className="text-sm text-ink-muted">
                          No detail rows in this export (summary counts only).
                        </p>
                      ) : (
                        selected.apartments.events.map((e, i) => (
                          <div
                            key={`${e.category}-${e.datetime}-${i}`}
                            className="rounded-lg border border-border px-3 py-2 text-sm"
                          >
                            <div className="flex justify-between">
                              <Badge variant="secondary">{e.category}</Badge>
                              <span className="text-ink-muted">{e.datetime ?? "—"}</span>
                            </div>
                            {e.duration ? (
                              <div className="mt-1 text-xs text-ink-muted">Duration {e.duration}</div>
                            ) : null}
                            {e.commentSummary ? (
                              <p className="mt-1 text-ink-muted">{e.commentSummary}</p>
                            ) : null}
                          </div>
                        ))
                      )}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            </Tabs>
          </>
        ) : null}

      </div>
    </div>
  );
}
