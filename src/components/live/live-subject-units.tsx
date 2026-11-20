"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { idempotentHeaders, newIdempotencyKey } from "@/lib/ui/idempotency-key";
import { labelUnitStatus } from "@/lib/ui/status-labels";
import { apiErrorMessage, toUserFacingError } from "@/lib/ui/user-facing-error";
import { toast } from "sonner";

type UnitType = { id: string; label: string; beds: number; baths: number };

type UnitRow = {
  id: string;
  unitTypeId: string;
  unitTypeLabel: string | null;
  beds: number | null;
  baths: number | null;
  unitNumber: string;
  sqft: number | null;
  askingRent: number | null;
  status: string;
  availableDate: string | null;
  notes: string | null;
  incomplete: boolean;
};

type Props = {
  propertyId: string;
  unitTypes: UnitType[];
  listingLinks: { zillow?: string; apartments?: string };
  /** Render under unit-type cards without a separate full-width card. */
  embedded?: boolean;
};

const STATUSES = ["available", "pending", "leased", "offline"] as const;

export function LiveSubjectUnitsManager({
  propertyId,
  unitTypes,
  listingLinks,
  embedded = false,
}: Props) {
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addingForTypeId, setAddingForTypeId] = useState<string | null>(null);
  const [form, setForm] = useState({
    unitTypeId: unitTypes[0]?.id ?? "",
    unitNumber: "",
    sqft: "",
    askingRent: null as number | null,
    status: "available" as (typeof STATUSES)[number],
    availableDate: "",
    notes: "",
  });

  function load() {
    setLoading(true);
    fetch(`/api/properties/${propertyId}/units`)
      .then((r) => r.json().then((json) => ({ ok: r.ok, json })))
      .then((res) => {
        if (!res.ok || !res.json.ok) {
          throw new Error(apiErrorMessage(res.json, "Could not load units"));
        }
        setUnits(res.json.data.units ?? []);
      })
      .catch((err) => toast.error(toUserFacingError(err, "Could not load units")))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) load();
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- propertyId drives reload
  }, [propertyId]);

  const defaultUnitTypeId = unitTypes[0]?.id ?? "";
  const formUnitTypeId = form.unitTypeId || defaultUnitTypeId;

  const unitsByType = useMemo(() => {
    const map = new Map<string, UnitRow[]>();
    for (const ut of unitTypes) map.set(ut.id, []);
    for (const u of units) {
      const list = map.get(u.unitTypeId);
      if (list) list.push(u);
      else map.set(u.unitTypeId, [u]);
    }
    return map;
  }, [units, unitTypes]);

  function startEdit(u: UnitRow) {
    setEditingId(u.id);
    setAddingForTypeId(u.unitTypeId);
    setForm({
      unitTypeId: u.unitTypeId,
      unitNumber: u.unitNumber,
      sqft: u.sqft != null ? String(u.sqft) : "",
      askingRent: u.askingRent,
      status: (STATUSES.includes(u.status as (typeof STATUSES)[number])
        ? u.status
        : "available") as (typeof STATUSES)[number],
      availableDate: u.availableDate ?? "",
      notes: u.notes ?? "",
    });
  }

  function startAdd(unitTypeId: string) {
    setEditingId(null);
    setAddingForTypeId(unitTypeId);
    setForm({
      unitTypeId,
      unitNumber: "",
      sqft: "",
      askingRent: null,
      status: "available",
      availableDate: "",
      notes: "",
    });
  }

  function resetForm() {
    setEditingId(null);
    setAddingForTypeId(null);
    setForm({
      unitTypeId: defaultUnitTypeId,
      unitNumber: "",
      sqft: "",
      askingRent: null,
      status: "available",
      availableDate: "",
      notes: "",
    });
  }

  async function saveWithType(unitTypeId: string) {
    if (!unitTypeId || !form.unitNumber.trim()) {
      toast.error("Unit type and unit number are required");
      return;
    }
    if (busy) return;
    setBusy(true);
    const idempotencyKey = editingId ? null : newIdempotencyKey();
    try {
      const body = {
        unitTypeId,
        unitNumber: form.unitNumber.trim(),
        sqft: form.sqft ? Number(form.sqft) : null,
        askingRent: form.askingRent,
        status: form.status,
        availableDate: form.availableDate || null,
        notes: form.notes.trim() || null,
      };
      const url = editingId
        ? `/api/units/${editingId}`
        : `/api/properties/${propertyId}/units`;
      const res = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: idempotentHeaders(idempotencyKey, {
          "content-type": "application/json",
        }),
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(apiErrorMessage(json, "Could not save unit"));
      toast.success(editingId ? "Changes saved." : "Unit added successfully.");
      resetForm();
      load();
    } catch (err) {
      toast.error(toUserFacingError(err, "Could not save unit"));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string, unitNumber: string) {
    if (!window.confirm(`Remove unit ${unitNumber}? This cannot be undone.`)) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/units/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(apiErrorMessage(json, "Could not remove unit"));
      toast.success("Unit removed");
      if (editingId === id) resetForm();
      load();
    } catch (err) {
      toast.error(toUserFacingError(err, "Could not remove unit"));
    } finally {
      setBusy(false);
    }
  }

  function renderUnitRow(u: UnitRow) {
    return (
      <div
        key={u.id}
        className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/80 bg-white px-3 py-2 text-sm"
      >
        <div>
          <div className="font-medium text-navy">Unit {u.unitNumber}</div>
          <div className="text-xs text-ink-muted">
            {u.sqft != null ? `${u.sqft} sqft` : "sqft —"} · ask{" "}
            {u.askingRent != null ? `$${u.askingRent}` : "—"} · {labelUnitStatus(u.status)}
            {u.availableDate ? ` · avail ${u.availableDate}` : ""}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {u.incomplete ? (
            <Badge variant="warning">Needs review</Badge>
          ) : (
            <Badge variant="outline">{labelUnitStatus(u.status)}</Badge>
          )}
          <Button size="sm" variant="outline" disabled={busy} onClick={() => startEdit(u)}>
            {u.incomplete ? "Complete details" : "Edit"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-rose-700 hover:bg-rose-50"
            disabled={busy}
            onClick={() => void remove(u.id, u.unitNumber)}
          >
            Remove
          </Button>
        </div>
      </div>
    );
  }

  function renderUnitForm(fixedUnitTypeId?: string) {
    const typeId = fixedUnitTypeId || formUnitTypeId;
    return (
      <div className="grid gap-2 rounded-md border border-dashed border-border bg-surface-muted/30 p-3 sm:grid-cols-3">
        {!fixedUnitTypeId ? (
          <div>
            <Label className="text-xs">Unit type</Label>
            <select
              className="h-9 w-full rounded-md border border-border bg-white px-2 text-sm"
              value={typeId}
              onChange={(e) => setForm({ ...form, unitTypeId: e.target.value })}
            >
              {unitTypes.map((ut) => (
                <option key={ut.id} value={ut.id}>
                  {ut.label} ({ut.beds}/{ut.baths})
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div>
          <Label className="text-xs">Unit number</Label>
          <Input
            value={form.unitNumber}
            onChange={(e) => setForm({ ...form, unitNumber: e.target.value })}
          />
        </div>
        <div>
          <Label className="text-xs">Status</Label>
          <select
            className="h-9 w-full rounded-md border border-border bg-white px-2 text-sm"
            value={form.status}
            onChange={(e) =>
              setForm({
                ...form,
                status: e.target.value as (typeof STATUSES)[number],
              })
            }
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {labelUnitStatus(s)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label className="text-xs">Sqft</Label>
          <Input
            value={form.sqft}
            disabled={busy}
            onChange={(e) => setForm({ ...form, sqft: e.target.value })}
          />
        </div>
        <div>
          <Label className="text-xs">Asking rent</Label>
          <CurrencyInput
            value={form.askingRent}
            disabled={busy}
            onValueChange={(askingRent) => setForm({ ...form, askingRent })}
          />
        </div>
        <div>
          <Label className="text-xs">Available date</Label>
          <Input
            type="date"
            value={form.availableDate}
            disabled={busy}
            onChange={(e) => setForm({ ...form, availableDate: e.target.value })}
          />
        </div>
        <div className={fixedUnitTypeId ? "sm:col-span-3" : "sm:col-span-3"}>
          <Label className="text-xs">Notes</Label>
          <Input
            value={form.notes}
            disabled={busy}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </div>
        <div className="flex flex-wrap gap-2 sm:col-span-3">
          <Button
            size="sm"
            variant="gold"
            pending={busy}
            onClick={() => {
              if (fixedUnitTypeId && form.unitTypeId !== fixedUnitTypeId) {
                setForm((f) => ({ ...f, unitTypeId: fixedUnitTypeId }));
              }
              void saveWithType(fixedUnitTypeId ?? formUnitTypeId);
            }}
          >
            {editingId ? "Save unit" : "Add unit"}
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => resetForm()}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  const listingLinksBlock =
    listingLinks.zillow || listingLinks.apartments ? (
      <div className="rounded-md border border-border/70 bg-surface/40 px-3 py-2 text-xs text-ink-muted">
        Listing links (manual check only):{" "}
        {listingLinks.zillow ? (
          <a
            className="text-navy underline"
            href={listingLinks.zillow}
            target="_blank"
            rel="noreferrer"
          >
            Zillow
          </a>
        ) : null}
        {listingLinks.zillow && listingLinks.apartments ? " · " : null}
        {listingLinks.apartments ? (
          <a
            className="text-navy underline"
            href={listingLinks.apartments}
            target="_blank"
            rel="noreferrer"
          >
            Apartments.com
          </a>
        ) : null}
      </div>
    ) : null;

  if (embedded) {
    if (unitTypes.length === 0) {
      return (
        <p className="text-sm text-ink-muted">
          Add a unit type first, then you can attach available units under it.
        </p>
      );
    }

    return (
      <div className="space-y-3">
        <div>
          <p className="text-sm font-medium text-navy">Available units</p>
          <p className="text-xs text-ink-muted">
            Kept under each unit type so you can review asking rents without scrolling away.
          </p>
        </div>
        {listingLinksBlock}
        {loading ? (
          <p className="text-sm text-ink-muted">Loading units…</p>
        ) : (
          unitTypes.map((ut) => {
            const typeUnits = unitsByType.get(ut.id) ?? [];
            const showForm = addingForTypeId === ut.id;
            return (
              <div
                key={ut.id}
                className="space-y-2 rounded-lg border border-border bg-surface-muted/20 p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-navy">{ut.label}</span>
                    <Badge variant="outline">
                      {ut.beds} bd / {ut.baths} ba
                    </Badge>
                    <span className="text-xs text-ink-muted">
                      {typeUnits.length} {typeUnits.length === 1 ? "unit" : "units"}
                    </span>
                  </div>
                  {!showForm ? (
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => startAdd(ut.id)}>
                      Add unit
                    </Button>
                  ) : null}
                </div>
                {typeUnits.length === 0 && !showForm ? (
                  <p className="text-xs text-ink-muted">No available units for this type yet.</p>
                ) : (
                  <div className="space-y-2">{typeUnits.map(renderUnitRow)}</div>
                )}
                {showForm ? renderUnitForm(ut.id) : null}
              </div>
            );
          })
        )}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Available units</CardTitle>
        <CardDescription>
          Add available units for this property. “Needs review” means rent, size, or unit number
          is still missing — use Complete details to finish.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {listingLinksBlock}
        {loading ? (
          <p className="text-sm text-ink-muted">Loading units…</p>
        ) : units.length === 0 ? (
          <p className="text-sm text-ink-muted">No subject units yet.</p>
        ) : (
          <div className="space-y-2">{units.map(renderUnitRow)}</div>
        )}
        {unitTypes.length === 0 ? (
          <p className="text-sm text-amber-800">
            Add a unit type above before creating subject units.
          </p>
        ) : (
          renderUnitForm()
        )}
      </CardContent>
    </Card>
  );
}
