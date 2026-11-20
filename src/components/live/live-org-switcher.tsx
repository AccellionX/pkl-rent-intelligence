"use client";

import type { LiveOrg } from "@/hooks/use-live-org";

type Props = {
  organizations: LiveOrg[];
  organizationId: string | null;
  onChange: (id: string) => void;
  className?: string;
};

/** Explicit active-organization control — persists via caller (useLiveOrg). */
export function LiveOrgSwitcher({
  organizations,
  organizationId,
  onChange,
  className,
}: Props) {
  if (organizations.length === 0) return null;

  const active = organizations.find((o) => o.id === organizationId);
  const emptyActive = (active?.propertyCount ?? 0) === 0;
  const hasNonEmpty = organizations.some((o) => o.propertyCount > 0);

  return (
    <div className={className}>
      <label className="mb-1 block text-xs font-medium text-ink-muted">
        Active organization
      </label>
      <select
        className="h-9 w-full max-w-md rounded-md border border-border bg-white px-2 text-sm text-navy"
        value={organizationId ?? ""}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Active organization"
      >
        {organizations.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name} ({o.propertyCount}{" "}
            {o.propertyCount === 1 ? "property" : "properties"}) · {o.role}
          </option>
        ))}
      </select>
      {emptyActive && hasNonEmpty ? (
        <p className="mt-1.5 text-xs text-amber-800">
          This organization has no properties. Switch to an organization with a portfolio to
          avoid an empty dashboard.
        </p>
      ) : null}
      {emptyActive && !hasNonEmpty ? (
        <p className="mt-1.5 text-xs text-ink-muted">
          No properties in any of your organizations yet. Create one under Properties.
        </p>
      ) : null}
    </div>
  );
}
