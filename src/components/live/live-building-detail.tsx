"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Building2 } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { GuidedReportChrome } from "@/components/buildings/guided-report-chrome";
import { GuidedStepNav } from "@/components/buildings/guided-step-nav";
import { PropertyNav } from "@/components/buildings/property-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { LiveAuthGate } from "@/components/live/live-auth-gate";
import { LivePropertyDrive } from "@/components/live/live-property-drive";
import { LiveSubjectUnitsManager } from "@/components/live/live-subject-units";
import { LivePhotoManager } from "@/components/live/live-photo-manager";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { labelReportStatus } from "@/lib/ui/status-labels";
import { apiErrorMessage, toUserFacingError } from "@/lib/ui/user-facing-error";
import { toast } from "sonner";

type Property = {
  id: string;
  name: string;
  marketing_name: string | null;
  address_line1: string;
  city: string;
  state: string;
  postal_code: string;
  year_built: number | null;
  stories: number | null;
  unit_count: number | null;
  amenities: string[] | null;
  external_links: Record<string, string> | null;
};

type UnitType = {
  id: string;
  label: string;
  beds: number;
  baths: number;
};

type ReportRow = {
  id: string;
  title: string;
  status: string;
  period_start: string;
  period_end: string;
};

export function LiveBuildingDetail({ propertyId }: { propertyId: string }) {
  return (
    <LiveAuthGate title="Sign in to open this property">
      {() => (
        <Suspense fallback={<PageSkeleton rows={3} />}>
          <LiveBuildingDetailInner propertyId={propertyId} />
        </Suspense>
      )}
    </LiveAuthGate>
  );
}

function LiveBuildingDetailInner({ propertyId }: { propertyId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reportId = searchParams.get("reportId");
  const unitTypeId = searchParams.get("unitTypeId");
  const step = searchParams.get("step");
  const isSubjectPhotosStep = step === "subject-photos" && Boolean(reportId);
  const [property, setProperty] = useState<Property | null>(null);
  const [unitTypes, setUnitTypes] = useState<UnitType[]>([]);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [amenitiesText, setAmenitiesText] = useState("");
  const [zillowLink, setZillowLink] = useState("");
  const [aptsLink, setAptsLink] = useState("");
  const [websiteLink, setWebsiteLink] = useState("");
  const [propertyNotes, setPropertyNotes] = useState("");
  const [newUt, setNewUt] = useState({ label: "", beds: "", baths: "" });
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch(`/api/properties/${propertyId}`).then((r) =>
        r.json().then((json) => ({ ok: r.ok, status: r.status, json })),
      ),
      fetch(`/api/properties/${propertyId}/unit-types`).then((r) =>
        r.json().then((json) => ({ ok: r.ok, json })),
      ),
      fetch(`/api/properties/${propertyId}/reports`).then((r) =>
        r.json().then((json) => ({ ok: r.ok, json })),
      ),
    ])
      .then(([propRes, utRes, repRes]) => {
        if (cancelled) return;
        if (propRes.status === 404 || !propRes.ok) {
          throw new Error(propRes.json.error?.message ?? "Property not found");
        }
        const p = propRes.json.data.property as Property;
        setProperty(p);
        setAmenitiesText((p.amenities ?? []).join(", "));
        setZillowLink(p.external_links?.zillow ?? "");
        setAptsLink(p.external_links?.apartments ?? p.external_links?.apartments_com ?? "");
        setWebsiteLink(
          typeof p.external_links?.website === "string" ? p.external_links.website : "",
        );
        setPropertyNotes(
          typeof p.external_links?.propertyNotes === "string"
            ? p.external_links.propertyNotes
            : "",
        );
        if (utRes.ok) setUnitTypes(utRes.json.data.unitTypes ?? []);
        if (repRes.ok) setReports(repRes.json.data.reports ?? []);
        setError(null);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setProperty(null);
        setError(err instanceof Error ? err.message : "Failed to load property");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [propertyId, reloadKey]);

  function load() {
    setLoading(true);
    setReloadKey((k) => k + 1);
  }

  async function saveProperty() {
    if (!property) return;
    setBusy(true);
    try {
      const amenities = amenitiesText
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await fetch(`/api/properties/${propertyId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: property.name,
          marketingName: property.marketing_name,
          addressLine1: property.address_line1,
          city: property.city,
          state: property.state,
          postalCode: property.postal_code,
          yearBuilt: property.year_built,
          stories: property.stories,
          unitCount: property.unit_count,
          amenities,
          externalLinks: {
            ...(property.external_links ?? {}),
            ...(zillowLink.trim().startsWith("http")
              ? { zillow: zillowLink.trim() }
              : {}),
            ...(aptsLink.trim().startsWith("http")
              ? { apartments: aptsLink.trim() }
              : {}),
            ...(websiteLink.trim().startsWith("http")
              ? { website: websiteLink.trim() }
              : {}),
            propertyNotes: propertyNotes.trim() || undefined,
          },
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(apiErrorMessage(json, "Could not save property"));
      toast.success("Changes saved.");
      load();
    } catch (err) {
      toast.error(toUserFacingError(err, "Could not save property"));
    } finally {
      setBusy(false);
    }
  }

  async function createUnitType() {
    if (busy) return;
    if (!newUt.label.trim()) {
      toast.error("Enter a unit type name");
      return;
    }
    const beds = Number(newUt.beds);
    const baths = Number(newUt.baths);
    if (!Number.isFinite(beds) || beds < 0 || !Number.isFinite(baths) || baths < 0) {
      toast.error("Enter bedrooms and bathrooms");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/properties/${propertyId}/unit-types`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          label: newUt.label.trim(),
          beds,
          baths,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(apiErrorMessage(json, "Could not create unit type"));
      toast.success("Unit type created successfully.");
      setNewUt({ label: "", beds: "", baths: "" });
      load();
    } catch (err) {
      toast.error(toUserFacingError(err, "Could not create unit type"));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <PageSkeleton rows={3} />;
  }

  if (error || !property) {
    return (
      <div className="px-6 py-5">
          <EmptyState
            icon={Building2}
            title="Property unavailable"
            description={error ?? "Not found or not in your organization."}
            actionLabel="Back to properties"
            onAction={() => router.push("/buildings")}
          />
      </div>
    );
  }

  return (
    <div>
      <Topbar
        title={property.name}
        subtitle={
          property.marketing_name
            ? `Marketed as “${property.marketing_name}”`
            : `${property.city}, ${property.state}`
        }
      />
      <div className="px-6 py-5">
        <Breadcrumbs
          items={[
            { label: "Dashboard", href: "/" },
            { label: "Properties", href: "/buildings" },
            { label: property.name },
          ]}
        />
        {isSubjectPhotosStep ? (
          <>
            <GuidedReportChrome
              propertyId={propertyId}
              defaultStep="subject-photos"
              requireReportId
            />
            <div id="photos" className="space-y-4">
              <GuidedStepNav
                propertyId={propertyId}
                reportRunId={reportId}
                unitTypeId={unitTypeId}
                activeStep="subject-photos"
                continueLabel="Continue to comparable photos"
              />
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Choose subject photos</CardTitle>
                  <CardDescription>
                    Select photographs of this property for the weekly report. Stay in the guided
                    steps — you do not need to leave this report.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <LivePhotoManager propertyId={propertyId} />
                </CardContent>
              </Card>
            </div>
          </>
        ) : (
          <>
        <PropertyNav buildingId={propertyId} />

        <div className="grid gap-5 lg:grid-cols-[3fr_2fr] lg:items-start">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Property identity</CardTitle>
              <CardDescription>
                One-time property setup. Confirmed details carry forward to later weekly reports.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label className="text-xs">Name</Label>
                <Input
                  value={property.name}
                  onChange={(e) => setProperty({ ...property, name: e.target.value })}
                />
              </div>
              <div className="sm:col-span-2">
                <Label className="text-xs">Marketing name</Label>
                <Input
                  value={property.marketing_name ?? ""}
                  onChange={(e) =>
                    setProperty({ ...property, marketing_name: e.target.value || null })
                  }
                />
              </div>
              <div className="sm:col-span-2">
                <Label className="text-xs">Address</Label>
                <Input
                  value={property.address_line1}
                  onChange={(e) =>
                    setProperty({ ...property, address_line1: e.target.value })
                  }
                />
              </div>
              <div>
                <Label className="text-xs">City</Label>
                <Input
                  value={property.city}
                  onChange={(e) => setProperty({ ...property, city: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-xs">State</Label>
                <Input
                  value={property.state}
                  onChange={(e) => setProperty({ ...property, state: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-xs">Year built</Label>
                <Input
                  value={property.year_built ?? ""}
                  onChange={(e) =>
                    setProperty({
                      ...property,
                      year_built: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                />
              </div>
              <div>
                <Label className="text-xs">Unit count</Label>
                <Input
                  value={property.unit_count ?? ""}
                  onChange={(e) =>
                    setProperty({
                      ...property,
                      unit_count: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                />
              </div>
              <div>
                <Label className="text-xs">Stories</Label>
                <Input
                  value={property.stories ?? ""}
                  onChange={(e) =>
                    setProperty({
                      ...property,
                      stories: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                />
              </div>
              <div>
                <Label className="text-xs">Postal code</Label>
                <Input
                  value={property.postal_code}
                  onChange={(e) =>
                    setProperty({ ...property, postal_code: e.target.value })
                  }
                />
              </div>
              <div className="sm:col-span-2">
                <Label className="text-xs">Amenities (comma-separated)</Label>
                <Textarea
                  value={amenitiesText}
                  onChange={(e) => setAmenitiesText(e.target.value)}
                  rows={2}
                />
              </div>
              <div>
                <Label className="text-xs">Zillow listing link</Label>
                <Input
                  value={zillowLink}
                  onChange={(e) => setZillowLink(e.target.value)}
                  placeholder="Optional — extracted from uploads when present"
                />
              </div>
              <div>
                <Label className="text-xs">Apartments.com link</Label>
                <Input
                  value={aptsLink}
                  onChange={(e) => setAptsLink(e.target.value)}
                  placeholder="Optional — extracted from uploads when present"
                />
              </div>
              <div className="sm:col-span-2">
                <Label className="text-xs">Property website</Label>
                <Input
                  value={websiteLink}
                  onChange={(e) => setWebsiteLink(e.target.value)}
                  placeholder="Optional — fill only when the source file includes a site"
                />
              </div>
              <div className="sm:col-span-2">
                <Label className="text-xs">Property notes</Label>
                <Textarea
                  value={propertyNotes}
                  onChange={(e) => setPropertyNotes(e.target.value)}
                  rows={2}
                  placeholder="Manual staff notes (stored with listing links; provenance preserved on save)"
                />
              </div>
              <div className="sm:col-span-2">
                <Button variant="gold" pending={busy} onClick={() => void saveProperty()}>
                  Save property
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-5">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Unit types & available units</CardTitle>
                <CardDescription>
                  Reports are unit-type scoped. Available units stay under each type.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label className="text-xs">Unit type name</Label>
                    <Input
                      value={newUt.label}
                      onChange={(e) => setNewUt({ ...newUt, label: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Bedrooms</Label>
                    <Input
                      value={newUt.beds}
                      onChange={(e) => setNewUt({ ...newUt, beds: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Bathrooms</Label>
                    <Input
                      value={newUt.baths}
                      onChange={(e) => setNewUt({ ...newUt, baths: e.target.value })}
                    />
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  pending={busy}
                  onClick={() => void createUnitType()}
                >
                  Add unit type
                </Button>

                <LiveSubjectUnitsManager
                  propertyId={propertyId}
                  unitTypes={unitTypes}
                  embedded
                  listingLinks={{
                    zillow: zillowLink.trim().startsWith("http") ? zillowLink.trim() : undefined,
                    apartments: aptsLink.trim().startsWith("http")
                      ? aptsLink.trim()
                      : undefined,
                  }}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Report history</CardTitle>
                <CardDescription>Runs for this property</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {reports.length === 0 ? (
                  <p className="text-sm text-ink-muted">No report runs yet.</p>
                ) : (
                  reports.slice(0, 8).map((r) => (
                    <div
                      key={r.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/70 px-3 py-2 text-sm"
                    >
                      <div>
                        <div className="font-medium text-navy">{r.title}</div>
                        <div className="text-xs text-ink-muted">
                          {r.period_start} → {r.period_end}
                        </div>
                      </div>
                      <Badge variant="outline">{labelReportStatus(r.status)}</Badge>
                    </div>
                  ))
                )}
                <Button asChild size="sm" variant="outline">
                  <Link href={`/buildings/${propertyId}/reports`}>Open report workspace</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="mt-5 space-y-5">
          <LivePropertyDrive propertyId={propertyId} compact />
          <p className="text-xs text-ink-muted">
            Subject photos are chosen in the weekly report Step 3 so you stay in the guided
            workflow.
          </p>
        </div>
          </>
        )}
      </div>
    </div>
  );
}
