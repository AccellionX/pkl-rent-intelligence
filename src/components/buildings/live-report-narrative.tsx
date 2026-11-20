"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Building2 } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { GuidedReportChrome } from "@/components/buildings/guided-report-chrome";
import { GuidedStepNav } from "@/components/buildings/guided-step-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CurrencyInput } from "@/components/ui/currency-input";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { idempotentHeaders, newIdempotencyKey } from "@/lib/ui/idempotency-key";
import { labelAssemblyStatus, labelNarrativeStatus } from "@/lib/ui/status-labels";
import { apiErrorMessage, toUserFacingError } from "@/lib/ui/user-facing-error";
import { formatCurrency } from "@/lib/utils";
import type { CanonicalReportPayload, NarrativeSections } from "@/lib/reports/types";

type ReportOption = { id: string; title: string; period_start: string; period_end: string };

const SECTION_KEYS: Array<{ key: keyof NarrativeSections; label: string }> = [
  { key: "pricingExplanation", label: "Pricing explanation" },
  { key: "compComparison", label: "Comp comparison" },
  { key: "marketContext", label: "Market context" },
  { key: "weeklyPerformance", label: "Weekly performance" },
  { key: "suggestedActions", label: "Suggested actions" },
];

export function LiveReportNarrative({ propertyId }: { propertyId: string }) {
  return (
    <Suspense
      fallback={
        <div>
          <Topbar title="Pricing" />
          <PageSkeleton rows={4} />
        </div>
      }
    >
      <LiveReportNarrativeInner propertyId={propertyId} />
    </Suspense>
  );
}

function LiveReportNarrativeInner({ propertyId }: { propertyId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlReportId = searchParams.get("reportId");
  const urlUnitTypeId = searchParams.get("unitTypeId");
  const isGuided = Boolean(urlReportId);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [propertyName, setPropertyName] = useState("Property");
  const [reports, setReports] = useState<ReportOption[]>([]);
  const [reportId, setReportId] = useState<string | null>(urlReportId);
  const [payload, setPayload] = useState<CanonicalReportPayload | null>(null);
  const [sections, setSections] = useState<NarrativeSections | null>(null);
  const [rentLow, setRentLow] = useState<number | null>(null);
  const [rentHigh, setRentHigh] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const applyAssemble = useCallback((next: CanonicalReportPayload) => {
    setPayload(next);
    setSections(next.narrative.document?.sections ?? null);
    setRentLow(next.pricing.recommendedRentLow);
    setRentHigh(next.pricing.recommendedRentHigh);
  }, []);

  const loadAssemble = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/reports/${id}/assemble`);
      const json = await res.json();
      if (!res.ok) throw new Error(apiErrorMessage(json, "Could not load report data"));
      applyAssemble(json.data.payload as CanonicalReportPayload);
    },
    [applyAssemble],
  );

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch(`/api/properties/${propertyId}`).then((r) =>
        r.json().then((json) => ({ ok: r.ok, json })),
      ),
      fetch(`/api/properties/${propertyId}/reports`).then((r) =>
        r.json().then((json) => ({ ok: r.ok, json })),
      ),
    ])
      .then(([propRes, repRes]) => {
        if (cancelled) return;
        if (!propRes.ok) {
          throw new Error(apiErrorMessage(propRes.json, "Could not load property"));
        }
        if (!repRes.ok) {
          throw new Error(apiErrorMessage(repRes.json, "Could not load reports"));
        }
        setPropertyName(propRes.json.data?.property?.name ?? "Property");
        const list = (repRes.json.data?.reports ?? repRes.json.data ?? []) as ReportOption[];
        setReports(Array.isArray(list) ? list : []);
        setReportId((prev) => urlReportId ?? prev ?? (list[0]?.id ?? null));
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(toUserFacingError(e, "Could not load pricing"));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [propertyId, urlReportId]);

  useEffect(() => {
    if (urlReportId) setReportId(urlReportId);
  }, [urlReportId]);

  useEffect(() => {
    if (!reportId) return;
    let cancelled = false;
    fetch(`/api/reports/${reportId}/assemble`)
      .then((r) => r.json().then((json) => ({ ok: r.ok, json })))
      .then((res) => {
        if (cancelled) return;
        if (!res.ok) throw new Error(apiErrorMessage(res.json, "Could not load report data"));
        applyAssemble(res.json.data.payload as CanonicalReportPayload);
      })
      .catch((e) => {
        if (!cancelled) setMessage(toUserFacingError(e, "Could not load report data"));
      });
    return () => {
      cancelled = true;
    };
  }, [reportId, applyAssemble]);

  async function generate(preserveUserEdits: boolean, opts?: { silentBusy?: boolean }) {
    if (!reportId) return;
    if (!opts?.silentBusy) {
      if (busy) return;
      setBusy(true);
    }
    setMessage(null);
    const idempotencyKey = newIdempotencyKey();
    try {
      const res = await fetch(`/api/reports/${reportId}/narrative`, {
        method: "POST",
        headers: idempotentHeaders(idempotencyKey, {
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ preserveUserEdits, force: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(apiErrorMessage(json, "Could not generate narrative"));
      setSections(json.data.narrative.sections);
      setMessage(
        json.data.usedLiveClaude
          ? "Narrative draft generated"
          : "Narrative draft generated from available report data",
      );
      await loadAssemble(reportId);
    } catch (e) {
      setMessage(toUserFacingError(e, "Could not generate narrative"));
      if (opts?.silentBusy) throw e;
    } finally {
      if (!opts?.silentBusy) setBusy(false);
    }
  }

  async function saveRentRange() {
    if (!reportId) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/reports/${reportId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recommendedRentLow: rentLow,
          recommendedRentHigh: rentHigh,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(apiErrorMessage(json, "Could not save rent range"));
      setMessage("Rent range saved — generating narrative…");
      await loadAssemble(reportId);
      try {
        await generate(false, { silentBusy: true });
      } catch {
        setMessage(
          "Rent range saved. Narrative could not be generated automatically — try Generate draft.",
        );
      }
    } catch (e) {
      setMessage(toUserFacingError(e, "Could not save rent range"));
    } finally {
      setBusy(false);
    }
  }

  async function saveEdits() {
    if (!reportId || !sections || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/reports/${reportId}/narrative`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sections }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(apiErrorMessage(json, "Could not save narrative edits"));
      setMessage("Narrative edits saved");
      await loadAssemble(reportId);
    } catch (e) {
      setMessage(toUserFacingError(e, "Could not save narrative edits"));
    } finally {
      setBusy(false);
    }
  }

  async function createSnapshot() {
    if (!reportId || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/reports/${reportId}/snapshot`, {
        method: "POST",
        headers: idempotentHeaders(newIdempotencyKey()),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(apiErrorMessage(json, "Could not lock report snapshot"));
      setMessage(
        `Snapshot locked (v${json.data?.snapshot?.version ?? "—"}). You can generate the final PDF next.`,
      );
      await loadAssemble(reportId);
    } catch (e) {
      setMessage(toUserFacingError(e, "Could not lock report snapshot"));
    } finally {
      setBusy(false);
    }
  }

  async function approve() {
    if (!reportId || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      // Server approves + locks snapshot atomically (rolls back approval on lock failure).
      const res = await fetch(`/api/reports/${reportId}/narrative/approve`, {
        method: "POST",
        headers: idempotentHeaders(newIdempotencyKey()),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(apiErrorMessage(json, "Could not approve narrative"));
      const version = json.data?.snapshot?.version;
      setMessage(
        version != null
          ? `Narrative approved and ready for the final PDF (version ${version}). Continue to PDF Report.`
          : "Narrative approved and ready for the final PDF. Continue to PDF Report.",
      );
      await loadAssemble(reportId);
    } catch (e) {
      setMessage(toUserFacingError(e, "Could not approve narrative"));
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    if (!reportId || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/reports/${reportId}/narrative/reject`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(apiErrorMessage(json, "Could not reject narrative"));
      setMessage("Narrative rejected");
      await loadAssemble(reportId);
    } catch (e) {
      setMessage(toUserFacingError(e, "Could not reject narrative"));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div>
        <Topbar title="Pricing" subtitle={propertyName} />
        <PageSkeleton rows={4} />
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <Topbar title="Pricing" />
        <div className="px-6 py-5">
          <EmptyState
            icon={Building2}
            title="Could not load live pricing"
            description={error}
            actionLabel="Retry"
            onAction={() => router.refresh()}
          />
        </div>
      </div>
    );
  }

  return (
    <div>
      <Topbar
        title="Pricing Analysis"
        subtitle={
          payload?.pricing.recommendedRentLow != null &&
          payload.pricing.recommendedRentHigh != null
            ? `Recommendation ${formatCurrency(payload.pricing.recommendedRentLow)}–${formatCurrency(payload.pricing.recommendedRentHigh)} / month`
            : propertyName
        }
      />
      <div className="px-6 py-5">
        <Breadcrumbs
          items={[
            { label: "Portfolio", href: "/" },
            { label: "Buildings", href: "/buildings" },
            { label: propertyName, href: `/buildings/${propertyId}` },
            { label: "Pricing" },
          ]}
        />
        <GuidedReportChrome propertyId={propertyId} defaultStep="pricing" />

        {isGuided && reportId ? (
          <GuidedStepNav
            propertyId={propertyId}
            reportRunId={reportId}
            unitTypeId={urlUnitTypeId}
            activeStep="pricing"
            continueLabel="Continue to preview"
            continueDisabled={!rentLow || !rentHigh}
            continueHint={
              !rentLow || !rentHigh
                ? "Set and save the rent range before continuing."
                : payload?.narrative.document?.status !== "approved"
                  ? "You can continue to preview. Approve the narrative before generating the final PDF."
                  : null
            }
          />
        ) : null}

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Badge variant="outline">Market summary & recommendation</Badge>
          <Badge variant="outline">Narrative draft — numbers stay as entered</Badge>
          {payload?.narrative.stale ? (
            <Badge variant="secondary">Needs refresh after data changes</Badge>
          ) : null}
        </div>

        {!reports.length ? (
          <EmptyState
            icon={Building2}
            title="No report runs yet"
            description="Create a report run for this property’s unit type, then return here to assemble and draft narrative."
            actionLabel="Open reports"
            onAction={() => {
              router.push(`/buildings/${propertyId}/reports`);
            }}
          />
        ) : (
          <>
            {!isGuided ? (
              <div className="mb-5 flex flex-wrap items-end gap-3">
                <div className="space-y-1">
                  <Label htmlFor="report">Report run</Label>
                  <select
                    id="report"
                    className="h-10 rounded-md border border-border bg-white px-3 text-sm"
                    value={reportId ?? ""}
                    onChange={(e) => setReportId(e.target.value)}
                  >
                    {reports.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.title} ({r.period_start} → {r.period_end})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ) : null}

            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Recommended rent range</CardTitle>
                <CardDescription>
                  Set the min and max rent for this report. Saving also drafts the narrative.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap items-end gap-3">
                <div>
                  <Label>Minimum recommended rent</Label>
                  <CurrencyInput value={rentLow} onValueChange={setRentLow} />
                </div>
                <div>
                  <Label>Maximum recommended rent</Label>
                  <CurrencyInput value={rentHigh} onValueChange={setRentHigh} />
                </div>
                <Button onClick={() => void saveRentRange()} pending={busy}>
                  Save range and draft narrative
                </Button>
                {payload ? (
                  <p className="w-full text-xs text-ink-muted">
                    Market blend{" "}
                    {payload.pricing.stats.blendedAverageRent != null
                      ? formatCurrency(payload.pricing.stats.blendedAverageRent)
                      : "—"}{" "}
                    · comps{" "}
                    {payload.pricing.stats.rangeLow != null
                      ? formatCurrency(payload.pricing.stats.rangeLow)
                      : "—"}
                    –
                    {payload.pricing.stats.rangeHigh != null
                      ? formatCurrency(payload.pricing.stats.rangeHigh)
                      : "—"}{" "}
                    · {labelAssemblyStatus(payload.status)}
                  </p>
                ) : null}
              </CardContent>
            </Card>

            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Pricing narrative</CardTitle>
                <CardDescription>
                  Review the draft, edit if needed, then approve before the final PDF.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {!sections ? (
                    <Button onClick={() => void generate(false)} pending={busy}>
                      Generate draft
                    </Button>
                  ) : (
                    <>
                      <Button
                        variant="outline"
                        onClick={() => void generate(true)}
                        pending={busy}
                      >
                        Regenerate (keep edits)
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => void saveEdits()}
                        pending={busy}
                      >
                        Save edits
                      </Button>
                      <Button onClick={() => void approve()} pending={busy}>
                        Approve narrative
                      </Button>
                      {payload?.narrative.document?.status === "approved" ? (
                        <Button
                          variant="outline"
                          onClick={() => void createSnapshot()}
                          pending={busy}
                        >
                          Refresh approved version
                        </Button>
                      ) : null}
                      {payload?.narrative.document?.status === "approved" ? (
                        <Button variant="ghost" onClick={() => void reject()} pending={busy}>
                          Send back for edits
                        </Button>
                      ) : null}
                    </>
                  )}
                </div>
                {payload?.narrative.document ? (
                  <p className="text-xs text-ink-muted">
                    Status: {labelNarrativeStatus(payload.narrative.document.status)}
                    {" · "}
                    Approve prepares the final PDF.
                  </p>
                ) : null}
                {sections
                  ? SECTION_KEYS.map(({ key, label }) => (
                      <div key={key}>
                        <Label>{label}</Label>
                        <Textarea
                          rows={3}
                          value={sections[key]}
                          onChange={(e) =>
                            setSections((s) => (s ? { ...s, [key]: e.target.value } : s))
                          }
                        />
                      </div>
                    ))
                  : (
                    <p className="text-sm text-ink-muted">
                      Save the rent range above to draft the narrative automatically.
                    </p>
                  )}
                {message ? <p className="text-xs text-ink-muted">{message}</p> : null}
              </CardContent>
            </Card>

          </>
        )}
      </div>
    </div>
  );
}
