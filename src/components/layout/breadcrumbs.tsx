import Link from "next/link";
import { ChevronRight } from "lucide-react";

export interface Crumb {
  label: string;
  href?: string;
}

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-4 flex flex-wrap items-center gap-1 text-sm">
      {items.map((item, idx) => {
        const last = idx === items.length - 1;
        return (
          <span key={`${item.label}-${idx}`} className="flex items-center gap-1">
            {idx > 0 && <ChevronRight className="h-3.5 w-3.5 text-ink-subtle" />}
            {item.href && !last ? (
              <Link href={item.href} className="text-ink-muted transition-colors hover:text-navy">
                {item.label}
              </Link>
            ) : (
              <span className={last ? "font-medium text-navy" : "text-ink-muted"}>
                {item.label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
