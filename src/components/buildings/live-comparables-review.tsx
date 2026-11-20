"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Building2, RefreshCw } from "lucide-react";
import { GuidedStepNav } from "@/components/buildings/guided-step-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { Textarea } from "@/components/ui/textarea";
import { LivePhotoManager } from "@/components/live/live-photo-manager";
import {
  labelReviewStatus,
  labelSourceType,
  labelTier,
} from "@/lib/ui/status-labels";
import { apiErrorMessage, toUserFacingError } from "@/lib/ui/user-facing-error";
import { toast } from "sonner";

type PendingCandidate = {
  id: string;
  kind: "extraction";
  fieldKey: string;
  reviewStatus: string;
  sourceType: string;
  label: string;
  missingIdentity?: boolean;
  missingRent?: boolean;
  missingTargetUnitType?: boolean;
  addressLine1: string | null;
  addressRaw: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  rent: number | null;
  sqft: number | null;
  beds: number | null;
  daysOnMarket?: number | null;
  distanceMiles: number | null;
  mlsNumber: string | null;
  websiteUrl: string | null;
};

type MarketMetric = {
  id: string;
  fieldKey: string;
  unitTypeLabel: string;
  daysOnMarket: number | null;
  askingRent: number | null;
  listings: number | null;
  avgSqft: number | null;
  reviewStatus: string;
};

type UnitRow = {
  id: string;
  kind: "unit_data";
  status: string;
  matchTier: string | null;
  sourceType: string;
  label: string;
  addressLine1: string | null;
  city: string | null;
  comparablePropertyId: string;
  rentMin: number | null;
  rentMax: number | null;
  sqft: number | null;
  daysOnMarket: number | null;
  distanceMiles: number | null;
  notes: string | null;
  hasAvailableData?: boolean;
};

type ReviewPayload = {
  propertyId: string;
  unitTypeId: string | null;
  property: {
    name: string;
    addressLine1: string;
    city: string;
    state: string;
  };
  documents: Array<{ id: string; original_filename: string | null; source_type: string }>;
  pendingCandidates: PendingCandidate[];
  pendingMarketMetrics?: MarketMetric[];
  acceptedMarketMetrics?: MarketMetric[];
  approvedUnits: UnitRow[];
  excludedUnits: UnitRow[];
  summary: {
    pendingCount: number;
    approvedCount: number;
    excludedCount: number;
    documentCount: number;
    pendingMarketMetricCount?: number;
  };
};

function money(n: number | null): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `$${Math.round(n).toLocaleString()}`;
}

export function LiveComparablesReview({ propertyId }: { propertyId: string }) {
  return (
    <Suspense fallback={<PageSkeleton rows={4} />}>
      <LiveComparablesReviewInner propertyId={propertyId} />
    </Suspense>
  );
}

function LiveComparablesReviewInner({ propertyId }: { propertyId: string }) {
  const searchParams = useSearchParams();
  const reportId = searchParams.get("reportId");
  const unitTypeIdParam = searchParams.get("unitTypeId");
  const step = searchParams.get("step") ?? "comparables";
  const [data, setData] = useState<ReviewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyBulk, setBusyBulk] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [tierById, setTierById] = useState<Record<string, string>>({});
  const [rowReason, setRowReason] = useState<Record<string, string>>({});
  const [domDraft, setDomDraft] = useState<Record<string, string>>({});
  const [photoCompId, setPhotoCompId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkTier, setBulkTier] = useState("moderate");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/properties/${propertyId}/comparables/review`)
      .then((r) => r.json().then((json) => ({ ok: r.ok, json })))
      .then((res) => {
        if (cancelled) return;
        if (!res.ok || !res.json.ok) {
          throw new Error(apiErrorMessage(res.json, "Could not load comparables"));
        }
        setData(res.json.data as ReviewPayload);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        toast.error(toUserFacingError(err, "Could not load comparables"));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [propertyId, reloadKey]);

  function reload() {
    setLoading(true);
    setReloadKey((k) => k + 1);
  }

  function tierFor(id: string): string | null {
    return tierById[id] ?? null;
  }

  function reasonFor(id: string, fallback: string) {
    const typed = rowReason[id]?.trim();
    return typed || fallback;
  }

  async function acceptExtraction(extractionId: string) {
    if (!data?.unitTypeId) {
      toast.error("Add a unit type for this property before accepting comps");
      return;
    }
    const tier = tierFor(extractionId);
    if (!tier) {
      toast.error("Choose a match strength (Strongest, Moderate, or Context) before accepting");
      return;
    }
    if (busyId || busyBulk) {
      toast.message("Still saving the previous decision — try again in a moment.");
      return;
    }
    setBusyId(extractionId);
    try {
      const res = await fetch(`/api/extractions/${extractionId}/review`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          decision: "accepted",
          matchTier: tier,
          reason: reasonFor(extractionId, "Accepted during comparable review"),
          unitTypeId: data.unitTypeId,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(apiErrorMessage(json, "Could not accept comparable"));
      }
      toast.success("Comparable accepted");
      reload();
    } catch (err) {
      toast.error(toUserFacingError(err, "Could not accept comparable"));
    } finally {
      setBusyId(null);
    }
  }

  async function excludeExtraction(extractionId: string) {
    if (busyId || busyBulk) {
      toast.message("Still saving the previous decision — try again in a moment.");
      return;
    }
    setBusyId(extractionId);
    try {
      const res = await fetch(`/api/extractions/${extractionId}/review`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          decision: "rejected",
          reason: reasonFor(extractionId, "Excluded during comparable review"),
          unitTypeId: data?.unitTypeId ?? undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(apiErrorMessage(json, "Could not exclude comparable"));
      }
      toast.success("Comparable excluded");
      reload();
    } catch (err) {
      toast.error(toUserFacingError(err, "Could not exclude comparable"));
    } finally {
      setBusyId(null);
    }
  }

  async function reviewMarketMetric(extractionId: string, decision: "accepted" | "rejected") {
    if (busyId) return;
    setBusyId(extractionId);
    try {
      const res = await fetch(`/api/extractions/${extractionId}/review`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          decision,
          reason: reasonFor(
            extractionId,
            decision === "accepted"
              ? "Accepted unit-type market average"
              : "Excluded unit-type market average",
          ),
          unitTypeId: data?.unitTypeId ?? undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(apiErrorMessage(json, "Could not update market statistic"));
      }
      toast.success(
        decision === "accepted"
          ? "Market average saved for this report"
          : "Market average excluded",
      );
      reload();
    } catch (err) {
      toast.error(toUserFacingError(err, "Could not update market statistic"));
    } finally {
      setBusyId(null);
    }
  }

  async function patchUnitData(
    unitDataId: string,
    body: {
      status?: string;
      matchTier?: string | null;
      daysOnMarket?: number | null;
      reason?: string;
    },
  ) {
    if (busyId) return;
    setBusyId(unitDataId);
    try {
      const res = await fetch(`/api/comparable-unit-data/${unitDataId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...body,
          reason: body.reason || reasonFor(unitDataId, "Updated comparable review"),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(apiErrorMessage(json, "Could not update comparable"));
      }
      toast.success("Comparable updated");
      reload();
    } catch (err) {
      toast.error(toUserFacingError(err, "Could not update comparable"));
    } finally {
      setBusyId(null);
    }
  }

  const pendingIds = useMemo(
    () => (data?.pendingCandidates ?? []).map((c) => c.id),
    [data?.pendingCandidates],
  );

  if (loading && !data) {
    return <PageSkeleton rows={4} />;
  }

  if (!data) {
    return (
      <EmptyState
        icon={Building2}
        title="Comparables unavailable"
        description="Refresh the page or open this property again from your portfolio."
      />
    );
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllPending() {
    setSelectedIds((prev) => {
      if (pendingIds.length > 0 && pendingIds.every((id) => prev.has(id))) {
        return new Set();
      }
      return new Set(pendingIds);
    });
  }

  async function bulkAccept(tier: string) {
    if (!data?.unitTypeId) {
      toast.error("Add a unit type for this property before accepting comps");
      return;
    }
    const ids = [...selectedIds];
    if (ids.length === 0) {
      toast.error("Select at least one comparable");
      return;
    }
    setBusyBulk(true);
    let ok = 0;
    try {
      for (const id of ids) {
        setTierById((prev) => ({ ...prev, [id]: tier }));
        const res = await fetch(`/api/extractions/${id}/review`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            decision: "accepted",
            reason: reasonFor(id, "Bulk accepted"),
            unitTypeId: data.unitTypeId,
            matchTier: tier,
          }),
        });
        const json = await res.json();
        if (res.ok && json.ok) ok += 1;
      }
      toast.success(
        ok === ids.length
          ? `Accepted ${ok} comparable${ok === 1 ? "" : "s"}`
          : `Accepted ${ok} of ${ids.length}`,
      );
      setSelectedIds(new Set());
      reload();
    } catch (err) {
      toast.error(toUserFacingError(err, "Could not finish bulk accept"));
    } finally {
      setBusyBulk(false);
    }
  }

  async function bulkExclude() {
    const ids = [...selectedIds];
    if (ids.length === 0) {
      toast.error("Select at least one comparable");
      return;
    }
    setBusyBulk(true);
    let ok = 0;
    try {
      for (const id of ids) {
        const res = await fetch(`/api/extractions/${id}/review`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            decision: "rejected",
            reason: reasonFor(id, "Bulk excluded"),
          }),
        });
        const json = await res.json();
        if (res.ok && json.ok) ok += 1;
      }
      toast.success(`Excluded ${ok} comparable${ok === 1 ? "" : "s"}`);
      setSelectedIds(new Set());
      reload();
    } catch (err) {
      toast.error(toUserFacingError(err, "Could not finish bulk exclude"));
    } finally {
      setBusyBulk(false);
    }
  }

  const activeStep =
    step === "comp-photos" || step === "conflicts" || step === "comparables"
      ? step
      : "comparables";

  return (
    <div className="space-y-5">
      {reportId ? (
        <GuidedStepNav
          propertyId={propertyId}
          reportRunId={reportId}
          unitTypeId={unitTypeIdParam ?? data.unitTypeId}
          activeStep={
            activeStep === "comp-photos"
              ? "comp-photos"
              : activeStep === "conflicts"
                ? "conflicts"
                : "comparables"
          }
        />
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-ink-muted">
            Review extracted comps for{" "}
            <span className="font-medium text-navy">{data.property.name}</span>
            {" · "}
            {data.property.addressLine1}, {data.property.city}, {data.property.state}.
            Approvals are explicit — nothing is auto-approved.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => reload()} pending={loading}>
          <RefreshCw className="mr-1 h-3.5 w-3.5" /> Refresh
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Pending review" value={String(data.summary.pendingCount)} />
        <Stat label="Approved" value={String(data.summary.approvedCount)} />
        <Stat label="Excluded" value={String(data.summary.excludedCount)} />
        <Stat label="Source documents" value={String(data.summary.documentCount)} />
      </div>

      {(data.pendingMarketMetrics?.length ?? 0) > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Unit-type market averages</CardTitle>
            <CardDescription>
              HelloData market statistics for the area — separate from individual comparable
              listings. Accepting these does not change average days on market across your
              approved comps.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.pendingMarketMetrics!.map((m) => (
              <div
                key={m.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border px-3 py-3"
              >
                <div className="min-w-0 space-y-1">
                  <div className="font-medium text-navy">{m.unitTypeLabel} market average</div>
                  <p className="text-sm text-ink-muted">
                    Days on market {m.daysOnMarket ?? "—"}
                    {m.askingRent != null ? ` · Asking ${money(m.askingRent)}` : ""}
                    {m.listings != null ? ` · ${m.listings} listings` : ""}
                    {m.avgSqft != null ? ` · Avg ${m.avgSqft} sq ft` : ""}
                  </p>
                  <Textarea
                    className="mt-1 text-sm"
                    rows={1}
                    placeholder="Optional note for this decision"
                    value={rowReason[m.id] ?? ""}
                    onChange={(e) =>
                      setRowReason((prev) => ({ ...prev, [m.id]: e.target.value }))
                    }
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="gold"
                    pending={busyId === m.id}
                    disabled={busyId != null && busyId !== m.id}
                    onClick={() => void reviewMarketMetric(m.id, "accepted")}
                  >
                    Accept market average
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    pending={busyId === m.id}
                    disabled={busyId != null && busyId !== m.id}
                    onClick={() => void reviewMarketMetric(m.id, "rejected")}
                  >
                    Exclude
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {(data.acceptedMarketMetrics?.length ?? 0) > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Accepted market averages</CardTitle>
            <CardDescription>
              Shown on the report as labeled market statistics — not as comparable listing averages.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.acceptedMarketMetrics!.map((m) => (
              <p key={m.id} className="text-sm text-navy">
                <span className="font-medium">{m.unitTypeLabel}</span>
                {": "}
                {m.daysOnMarket != null ? `${m.daysOnMarket} days on market` : "—"}
                {m.askingRent != null ? ` · ${money(m.askingRent)} asking` : ""}
              </p>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Pending candidates</CardTitle>
          <CardDescription>
            Select several at once, then accept or exclude. Choose a match strength before accepting.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.pendingCandidates.length === 0 ? (
            <p className="text-sm text-ink-muted">
              No pending candidates. Upload Rentometer, HelloData, or MLS files on Data Uploads,
              then return here to review.
            </p>
          ) : (
            <>
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface-muted/40 px-3 py-2">
              <label className="flex items-center gap-2 text-sm text-navy">
                <input
                  type="checkbox"
                  checked={
                    pendingIds.length > 0 &&
                    pendingIds.every((id) => selectedIds.has(id))
                  }
                  onChange={toggleSelectAllPending}
                />
                Select all ({selectedIds.size} selected)
              </label>
              <label className="flex items-center gap-2 text-xs text-ink-muted">
                Match strength
                <select
                  className="rounded border border-border bg-white px-2 py-1 text-navy"
                  value={bulkTier}
                  onChange={(e) => setBulkTier(e.target.value)}
                >
                  <option value="strongest">Strongest</option>
                  <option value="moderate">Moderate</option>
                  <option value="context">Context</option>
                </select>
              </label>
              <Button
                size="sm"
                variant="gold"
                pending={busyBulk}
                disabled={selectedIds.size === 0}
                onClick={() => bulkAccept(bulkTier)}
              >
                Accept selected
              </Button>
              <Button
                size="sm"
                variant="outline"
                pending={busyBulk}
                disabled={selectedIds.size === 0}
                onClick={() => bulkExclude()}
              >
                Exclude selected
              </Button>
            </div>
            {data.pendingCandidates.map((c) => (
              <div
                key={c.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border px-3 py-3"
              >
                <label className="mt-1 shrink-0">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(c.id)}
                    onChange={() => toggleSelected(c.id)}
                    aria-label={`Select ${c.label}`}
                  />
                </label>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium text-navy">{c.label}</span>
                    <Badge variant="outline">{labelSourceType(c.sourceType)}</Badge>
                    <Badge variant="secondary">{labelReviewStatus(c.reviewStatus)}</Badge>
                    {c.mlsNumber ? (
                      <Badge variant="outline">MLS# {c.mlsNumber}</Badge>
                    ) : null}
                    {c.missingIdentity ? (
                      <Badge variant="secondary">Missing name/address</Badge>
                    ) : null}
                    {c.missingTargetUnitType ? (
                      <Badge variant="secondary">No matching unit type</Badge>
                    ) : null}
                    {c.missingRent ? (
                      <Badge variant="secondary">Rent missing</Badge>
                    ) : null}
                  </div>
                  <p className="text-sm text-ink-muted">
                    {[c.addressLine1 || c.addressRaw, c.city, c.state, c.postalCode]
                      .filter(Boolean)
                      .join(", ") || "Address not extracted — add during review if needed."}
                  </p>
                  <p className="text-sm text-ink-muted">
                    Rent {c.missingRent ? "not available" : money(c.rent)}
                    {c.beds != null ? ` · ${c.beds} bed` : ""}
                    {c.sqft != null ? ` · ${c.sqft} sq ft` : ""}
                    {c.daysOnMarket != null ? ` · ${c.daysOnMarket} days on market` : ""}
                    {c.distanceMiles != null ? ` · ${c.distanceMiles} mi` : ""}
                  </p>
                  {c.websiteUrl ? (
                    <p className="text-sm">
                      <a
                        className="text-navy underline"
                        href={c.websiteUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Listing / website link
                      </a>
                    </p>
                  ) : null}
                  <label className="flex items-center gap-2 text-xs text-ink-muted">
                    Match strength
                    <select
                      className="rounded border border-border bg-white px-2 py-1 text-navy"
                      value={tierFor(c.id) ?? ""}
                      onChange={(e) =>
                        setTierById((prev) => ({ ...prev, [c.id]: e.target.value }))
                      }
                    >
                      <option value="">Select…</option>
                      <option value="strongest">Strongest</option>
                      <option value="moderate">Moderate</option>
                      <option value="context">Context</option>
                    </select>
                  </label>
                  <Textarea
                    className="mt-1 text-sm"
                    rows={1}
                    placeholder="Optional note for this decision"
                    value={rowReason[c.id] ?? ""}
                    onChange={(e) =>
                      setRowReason((prev) => ({ ...prev, [c.id]: e.target.value }))
                    }
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="gold"
                    pending={busyId === c.id}
                    disabled={busyId != null && busyId !== c.id}
                    onClick={() => void acceptExtraction(c.id)}
                  >
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    pending={busyId === c.id}
                    disabled={busyId != null && busyId !== c.id}
                    onClick={() => void excludeExtraction(c.id)}
                  >
                    Exclude
                  </Button>
                </div>
              </div>
            ))}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Approved comparables</CardTitle>
          <CardDescription>Included in pricing when match tier and rent are set.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.approvedUnits.length === 0 ? (
            <p className="text-sm text-ink-muted">No approved comparables yet.</p>
          ) : (
            data.approvedUnits.map((u) => (
              <div key={u.id} className="space-y-3 rounded-lg border border-border px-3 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium text-navy">{u.label}</span>
                      <Badge variant="outline">{labelSourceType(u.sourceType)}</Badge>
                      <Badge variant="success">
                        {u.matchTier ? labelTier(u.matchTier) : "Tier unset"}
                      </Badge>
                      <Badge variant={u.hasAvailableData ? "success" : "secondary"}>
                        {u.hasAvailableData ? "In pricing set" : "Needs unit-type data"}
                      </Badge>
                    </div>
                    <p className="text-sm text-ink-muted">
                      {[u.addressLine1, u.city].filter(Boolean).join(", ")}
                      {" · "}
                      {u.rentMin != null && u.rentMax != null && u.rentMin !== u.rentMax
                        ? `${money(u.rentMin)}–${money(u.rentMax)}`
                        : money(u.rentMin ?? u.rentMax)}
                      {u.sqft != null ? ` · ${u.sqft} sq ft` : ""}
                      {u.daysOnMarket != null
                        ? ` · ${u.daysOnMarket} days on market`
                        : " · Days on market not set"}
                      {u.distanceMiles != null ? ` · ${u.distanceMiles} mi` : ""}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <label className="text-ink-muted">
                        Days on market
                        <input
                          className="ml-2 w-20 rounded border border-border px-2 py-1 text-navy"
                          inputMode="numeric"
                          placeholder={u.daysOnMarket != null ? String(u.daysOnMarket) : "—"}
                          value={domDraft[u.id] ?? ""}
                          onChange={(e) =>
                            setDomDraft((prev) => ({ ...prev, [u.id]: e.target.value }))
                          }
                        />
                      </label>
                      <Button
                        size="sm"
                        variant="outline"
                        pending={busyId === u.id}
                        disabled={busyId != null && busyId !== u.id}
                        onClick={() => {
                          const raw = (domDraft[u.id] ?? "").trim();
                          const next =
                            raw === "" ? null : Number.parseInt(raw, 10);
                          if (raw !== "" && (Number.isNaN(next!) || next! < 0)) {
                            toast.error("Enter a valid days-on-market value");
                            return;
                          }
                          void patchUnitData(u.id, {
                            daysOnMarket: next,
                            reason: "Staff updated listing days on market",
                          });
                        }}
                      >
                        Save days on market
                      </Button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant={photoCompId === u.comparablePropertyId ? "gold" : "outline"}
                      onClick={() =>
                        setPhotoCompId((prev) =>
                          prev === u.comparablePropertyId ? null : u.comparablePropertyId,
                        )
                      }
                    >
                      {photoCompId === u.comparablePropertyId
                        ? "Hide photos"
                        : "Manage photos"}
                    </Button>
                    {(["strongest", "moderate", "context"] as const).map((tier) => (
                      <Button
                        key={tier}
                        size="sm"
                        variant={u.matchTier === tier ? "gold" : "outline"}
                        pending={busyId === u.id}
                        disabled={busyId != null && busyId !== u.id}
                        onClick={() => void patchUnitData(u.id, { matchTier: tier })}
                      >
                        {labelTier(tier)}
                      </Button>
                    ))}
                    <Button
                      size="sm"
                      variant="ghost"
                      pending={busyId === u.id}
                      disabled={busyId != null && busyId !== u.id}
                      onClick={() => void patchUnitData(u.id, { status: "rejected" })}
                    >
                      Exclude
                    </Button>
                  </div>
                </div>
                {photoCompId === u.comparablePropertyId ? (
                  <LivePhotoManager
                    propertyId={propertyId}
                    comparablePropertyId={u.comparablePropertyId}
                  />
                ) : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Excluded</CardTitle>
          <CardDescription>Reviewed out of the pricing set for this property.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.excludedUnits.length === 0 ? (
            <p className="text-sm text-ink-muted">No excluded comps yet.</p>
          ) : (
            data.excludedUnits.map((u) => (
              <div key={u.id} className="rounded-lg border border-border px-3 py-3 text-sm">
                <div className="font-medium text-navy">{u.label}</div>
                <p className="text-ink-muted">
                  {labelSourceType(u.sourceType)} · {u.notes || "Excluded"}
                </p>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Source documents</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-ink-muted">
          {(data.documents ?? []).length === 0 ? (
            <p>No documents linked — upload market sources from Data Uploads.</p>
          ) : (
            <ul className="list-disc space-y-1 pl-5">
              {data.documents.map((d) => (
                <li key={d.id}>
                  {d.original_filename ?? "Untitled document"} ·{" "}
                  {labelSourceType(d.source_type)}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-white px-3 py-2 shadow-sm">
      <div className="text-[11px] uppercase tracking-wide text-ink-muted">{label}</div>
      <div className="text-lg font-semibold text-navy">{value}</div>
    </div>
  );
}
