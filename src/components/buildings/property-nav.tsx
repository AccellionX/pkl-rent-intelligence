"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { VETERANS_BUILDING_ID } from "@/data/veterans";

const links = [
  { href: (id: string) => `/buildings/${id}`, label: "Overview", exact: true },
  { href: (id: string) => `/buildings/${id}/comparables`, label: "Comparables" },
  { href: (id: string) => `/buildings/${id}/pricing`, label: "Pricing" },
  { href: (id: string) => `/buildings/${id}/leads`, label: "Leads" },
  { href: (id: string) => `/buildings/${id}/reports`, label: "PDF Report" },
];

export function PropertyNav({ buildingId }: { buildingId: string }) {
  const pathname = usePathname();
  const isFeatured = buildingId === VETERANS_BUILDING_ID;
  if (!isFeatured) return null;

  return (
    <div className="mb-5 overflow-x-auto">
      <div className="inline-flex min-w-full gap-1 rounded-lg border border-border bg-white p-1 shadow-sm sm:min-w-0">
        {links.map((link) => {
          const href = link.href(buildingId);
          const active = link.exact ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-navy text-white shadow-sm"
                  : "text-ink-muted hover:bg-surface-muted hover:text-navy",
              )}
            >
              {link.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
