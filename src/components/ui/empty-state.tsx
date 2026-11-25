import { type LucideIcon } from "lucide-react";
import { Button } from "./button";

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  pending = false,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Shows a spinner on the action button while a retry/load is in flight. */
  pending?: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-white px-6 py-16 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-surface-muted text-navy">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="text-base font-semibold text-navy">{title}</h3>
      <p className="mt-1 max-w-md text-sm text-ink-muted">{description}</p>
      {actionLabel && onAction && (
        <Button className="mt-5" pending={pending} onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
