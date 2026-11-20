"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Building2, Plus, Search, Trash2 } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Label } from "@/components/ui/label";
import { LiveAuthGate } from "@/components/live/live-auth-gate";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { usePendingAction } from "@/hooks/use-pending-action";
import { idempotentHeaders, newIdempotencyKey } from "@/lib/ui/idempotency-key";
import { apiErrorMessage, toUserFacingError } from "@/lib/ui/user-facing-error";
import { toast } from "sonner";

type PropertyRow = {
  id: string;
  name: string;
  marketing_name: string | null;
  address_line1: string;
  city: string;
  state: string;
  postal_code: string;
  unit_count: number | null;
};

export function LiveBuildingsPage() {
  return (
    <LiveAuthGate title="Sign in to manage properties">
      {(ctx) => <LiveBuildingsInner organizationId={ctx.organizationId!} />}
    </LiveAuthGate>
  );
}

function LiveBuildingsInner({ organizationId }: { organizationId: string }) {
  const { pending, run } = usePendingAction();
  const [properties, setProperties] = useState<PropertyRow[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [form, setForm] = useState({
    name: "",
    marketingName: "",
    addressLine1: "",
    city: "",
    state: "RI",
    postalCode: "",
  });

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/properties?organizationId=${organizationId}`)
      .then((r) => r.json().then((json) => ({ ok: r.ok, json })))
      .then((res) => {
        if (cancelled) return;
        if (!res.ok || !res.json.ok) {
          throw new Error(apiErrorMessage(res.json, "Could not load properties"));
        }
        setProperties(res.json.data.properties ?? []);
        setError(null);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setProperties([]);
        setError(toUserFacingError(err, "Could not load properties"));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId, reloadKey]);

  function load() {
    setLoading(true);
    setReloadKey((k) => k + 1);
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return properties;
    return properties.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.address_line1.toLowerCase().includes(q) ||
        p.city.toLowerCase().includes(q) ||
        (p.marketing_name?.toLowerCase().includes(q) ?? false),
    );
  }, [properties, query]);

  async function postCreate(confirmDuplicateAddress: boolean) {
    const idempotencyKey = newIdempotencyKey();
    const payload = {
      organizationId,
      name: form.name.trim(),
      marketingName: form.marketingName.trim() || undefined,
      addressLine1: form.addressLine1.trim(),
      city: form.city.trim(),
      state: form.state.trim(),
      postalCode: form.postalCode.trim(),
      country: "US",
      amenities: [] as string[],
      externalLinks: {},
      confirmDuplicateAddress,
    };
    const res = await fetch("/api/properties", {
      method: "POST",
      headers: idempotentHeaders(idempotencyKey, {
        "content-type": "application/json",
      }),
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (res.status === 409 && json?.error?.details?.code === "duplicate_property_address") {
      const names = (json.error.details.matches ?? [])
        .map((m: { name?: string }) => m.name)
        .filter(Boolean)
        .join(", ");
      const ok = window.confirm(
        `A property with this address already exists${names ? ` (${names})` : ""}. Create another property at the same address anyway?`,
      );
      if (!ok) return;
      await postCreate(true);
      return;
    }
    if (!res.ok || !json.ok) throw new Error(apiErrorMessage(json, "Could not create property"));
    toast.success("Property created");
    setShowCreate(false);
    setForm({
      name: "",
      marketingName: "",
      addressLine1: "",
      city: "",
      state: "RI",
      postalCode: "",
    });
    load();
  }

  async function createProperty() {
    await run(async () => {
      try {
        await postCreate(false);
      } catch (err) {
        toast.error(toUserFacingError(err, "Could not create property"));
      }
    });
  }

  async function deleteProperty(property: PropertyRow) {
    const ok = window.confirm(
      `Delete “${property.name}”? This removes the property and its related reports, uploads, and review data. This cannot be undone.`,
    );
    if (!ok) return;

    setDeletingId(property.id);
    await run(async () => {
      try {
        const res = await fetch(`/api/properties/${property.id}`, { method: "DELETE" });
        const json = await res.json();
        if (!res.ok || !json.ok) {
          throw new Error(apiErrorMessage(json, "Could not delete property"));
        }
        toast.success(`Deleted “${property.name}”`);
        setProperties((prev) => prev.filter((p) => p.id !== property.id));
      } catch (err) {
        toast.error(toUserFacingError(err, "Could not delete property"));
      } finally {
        setDeletingId(null);
      }
    });
  }

  if (loading && properties.length === 0 && !error) {
    return <PageSkeleton rows={4} />;
  }

  return (
    <div>
      <Topbar
        title="Properties"
        subtitle={
          loading
            ? "Loading…"
            : `${properties.length} ${properties.length === 1 ? "property" : "properties"}`
        }
      />
      <div className="px-6 py-5">
        <Breadcrumbs
          items={[{ label: "Dashboard", href: "/" }, { label: "Properties" }]}
        />

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
          <Button variant="gold" disabled={pending} onClick={() => setShowCreate((v) => !v)}>
            <Plus className="mr-1 h-4 w-4" /> New property
          </Button>
        </div>

        {showCreate ? (
          <Card className="mb-5">
            <CardHeader>
              <CardTitle className="text-base">Create property</CardTitle>
              <CardDescription>Add a building to start uploads and weekly reports</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              {(
                [
                  ["name", "Name"],
                  ["marketingName", "Marketing name"],
                  ["addressLine1", "Address"],
                  ["city", "City"],
                  ["state", "State"],
                  ["postalCode", "Postal code"],
                ] as const
              ).map(([key, label]) => (
                <div key={key}>
                  <Label className="text-xs">{label}</Label>
                  <Input
                    value={form[key]}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                    disabled={pending}
                  />
                </div>
              ))}
              <div className="md:col-span-2 flex gap-2">
                <Button
                  variant="gold"
                  pending={pending}
                  disabled={!form.name.trim() || !form.addressLine1.trim()}
                  onClick={() => void createProperty()}
                >
                  Save property
                </Button>
                <Button variant="outline" disabled={pending} onClick={() => setShowCreate(false)}>
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {loading && properties.length > 0 ? (
          <p className="mb-3 text-sm text-ink-muted" aria-live="polite">
            Refreshing…
          </p>
        ) : null}
        {error ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base text-rose-800">Could not load properties</CardTitle>
              <CardDescription>{error}</CardDescription>
            </CardHeader>
          </Card>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="No properties yet"
            description="Create a building to start uploads, comparable review, and pricing reports."
            actionLabel="Create property"
            onAction={() => setShowCreate(true)}
          />
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm table-row-hover">
                <thead className="border-b border-border bg-surface-muted/70 text-xs uppercase tracking-wider text-ink-subtle">
                  <tr>
                    <th className="px-4 py-3 font-medium">Property</th>
                    <th className="px-4 py-3 font-medium">Address</th>
                    <th className="px-4 py-3 font-medium">City</th>
                    <th className="px-4 py-3 font-medium">State</th>
                    <th className="px-4 py-3 font-medium">Units</th>
                    <th className="px-4 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => (
                    <tr key={p.id} className="border-b border-border/70 last:border-0">
                      <td className="px-4 py-3">
                        <div className="min-w-0">
                          <div className="font-medium text-navy">{p.name}</div>
                          {p.marketing_name ? (
                            <div className="text-xs text-ink-muted">
                              Marketed as “{p.marketing_name}”
                            </div>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-ink-muted">{p.address_line1}</td>
                      <td className="px-4 py-3 text-ink-muted">
                        {p.city}
                        {p.postal_code ? ` ${p.postal_code}` : ""}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline">{p.state}</Badge>
                      </td>
                      <td className="px-4 py-3 text-ink-muted">
                        {p.unit_count != null ? p.unit_count : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/buildings/${p.id}`}>Open</Link>
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                            pending={deletingId === p.id}
                            disabled={pending && deletingId !== p.id}
                            onClick={() => void deleteProperty(p)}
                            aria-label={`Delete ${p.name}`}
                          >
                            <Trash2 className="h-4 w-4" />
                            <span className="sr-only sm:not-sr-only sm:ml-1">Delete</span>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t border-border px-4 py-3 text-xs text-ink-muted">
              Showing {filtered.length} of {properties.length}{" "}
              {properties.length === 1 ? "property" : "properties"}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
