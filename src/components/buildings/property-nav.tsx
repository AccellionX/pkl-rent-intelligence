"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Property workspace navigation (persistent setup — not the weekly report stepper).
 * Report work uses GuidedReportChrome on report-scoped pages.
 */
const tabs = [
  { href: (id: string) => `/buildings/${id}`, label: "Property setup", exact: true },
];

export function PropertyNav({ buildingId }: { buildingId: string }) {
  const pathname = usePathname();
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      buildingId,
    );
  if (!isUuid) return null;

  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div className="overflow-x-auto">
        <div className="inline-flex gap-1 rounded-lg border border-border bg-white p-1 shadow-sm">
          {tabs.map((link) => {
            const href = link.href(buildingId);
            const pathOnly = href.split("?")[0]!;
            const active = link.exact
              ? pathname === pathOnly
              : pathname === pathOnly || pathname.startsWith(`${pathOnly}/`);
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

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button asChild size="sm" variant="outline">
          <Link href={`/upload?buildingId=${buildingId}`}>
            <Upload className="mr-1 h-4 w-4" /> Documents
          </Link>
        </Button>
        <Button asChild size="sm" variant="gold">
          <Link href={`/buildings/${buildingId}/reports`}>
            Start / continue report <ArrowRight className="ml-1 h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
