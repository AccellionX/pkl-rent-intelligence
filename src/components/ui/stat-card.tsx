import { type LucideIcon } from "lucide-react";
import { Card, CardContent } from "./card";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  trend,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  trend?: { label: string; positive?: boolean };
}) {
  return (
    <Card className="overflow-hidden transition-shadow hover:shadow-md">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-ink-subtle">
              {label}
            </p>
            <p className="mt-2 font-display text-2xl font-semibold tracking-tight text-navy">
              {value}
            </p>
            {hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
            {trend && (
              <p
                className={cn(
                  "mt-2 text-xs font-medium",
                  trend.positive ? "text-emerald-700" : "text-ink-muted",
                )}
              >
                {trend.label}
              </p>
            )}
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-navy/5 text-navy">
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
